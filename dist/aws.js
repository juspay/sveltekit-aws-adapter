import fs from "node:fs";
import * as path from "path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { LambdaClient, GetFunctionConfigurationCommand, UpdateFunctionCodeCommand, PublishVersionCommand } from "@aws-sdk/client-lambda";
import { CloudFrontClient, GetDistributionConfigCommand, UpdateDistributionCommand, CreateInvalidationCommand } from "@aws-sdk/client-cloudfront";
import * as mime from 'mime-types';
// Lambda@Edge functions must be created in the N. Virginia region.
/**
 * Uploads all files in a directory to an S3 bucket with the specified prefix.
 * @param directoryPath - The path to the directory containing the files to upload.
 * @param bucketName - The name of the S3 bucket to upload the files to.
 * @param s3Prefix - The prefix to add to the S3 object keys.
 * @param region - The AWS region where the S3 bucket is located.
 */
async function uploadToS3(directoryPath, bucketName, s3Prefix, region) {
    const items = fs.readdirSync(directoryPath);
    const s3 = new S3Client({ region: region });
    const prefix = s3Prefix && s3Prefix.length > 0 ? s3Prefix + "/" : "";
    for (const item of items) {
        const itemPath = path.join(directoryPath, item);
        const stats = fs.statSync(itemPath);
        if (stats.isFile()) {
            const fileStream = fs.createReadStream(itemPath);
            const contentType = mime.lookup(itemPath) || 'application/octet-stream';
            const s3Params = {
                Bucket: bucketName,
                Key: `${prefix}${path.relative(directoryPath, itemPath).replace(/\\/g, '/')}`,
                Body: fileStream,
                ContentType: contentType
            };
            try {
                await s3.send(new PutObjectCommand(s3Params));
                console.log(`Successfully uploaded ${itemPath} to ${bucketName}/${prefix}${path.relative(directoryPath, itemPath).replace(/\\/g, '/')}`);
            }
            catch (error) {
                console.error(`Failed to upload ${itemPath}:`, error);
            }
        }
        else if (stats.isDirectory()) {
            await uploadToS3(itemPath, bucketName, `${prefix}${item}`, region);
        }
    }
}
/**
 * Deploys a Lambda function with the given name and zip file path to the specified region.
 * @param functionName - The name of the Lambda function to deploy.
 * @param zipFilePath - The file path of the zip file containing the Lambda function code.
 * @param region - The AWS region to deploy the Lambda function to.
 * @returns The version of the deployed Lambda function.
 */
async function deployLambdaFunction(functionName, zipFilePath, region) {
    console.log("Reading zip file...", functionName, zipFilePath);
    const zipFile = fs.readFileSync(zipFilePath);
    const updateCodeParams = {
        FunctionName: functionName,
        ZipFile: zipFile
    };
    const lambda = new LambdaClient({ region });
    console.log("Updating Lambda Function...");
    try {
        await lambda.send(new UpdateFunctionCodeCommand(updateCodeParams));
        console.log('Lambda function code updated successfully.');
    }
    catch (error) {
        console.error(`Failed to update function code: ${error}`);
        throw error;
    }
    console.log('Waiting for update to complete...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    try {
        const publishVersionParams = {
            FunctionName: functionName,
        };
        const { Version } = await lambda.send(new PublishVersionCommand(publishVersionParams));
        console.log(`Lambda function version ${Version} published successfully.`);
        return Version;
    }
    catch (error) {
        console.error(`Failed to publish function version: ${error}`);
        throw error;
    }
}
/**
 * Sets up a CloudFront trigger for a Lambda function.
 * @param functionName - The name of the Lambda function.
 * @param functionVersion - The version of the Lambda function.
 * @param distributionId - The ID of the CloudFront distribution.
 * @param region - The AWS region in which the resources are located.
 * @throws An error if the DistributionConfig or DefaultCacheBehavior is missing.
 */
async function setupCloudFrontTrigger(functionName, functionVersion, distributionId, region) {
    try {
        // Get the current distribution configuration
        const lambda = new LambdaClient({ region });
        const cloudFront = new CloudFrontClient({ region });
        const getDistConfigCommand = new GetDistributionConfigCommand({ Id: distributionId });
        const { DistributionConfig } = await cloudFront.send(getDistConfigCommand);
        // Ensure that DistributionConfig and DefaultCacheBehavior are defined
        if (!DistributionConfig || !DistributionConfig.DefaultCacheBehavior) {
            throw new Error('Missing DistributionConfig or DefaultCacheBehavior');
        }
        // Get the Lambda function ARN
        const getFunctionConfigCommand = new GetFunctionConfigurationCommand({ FunctionName: functionName });
        const { FunctionArn } = await lambda.send(getFunctionConfigCommand);
        const lambdaFunctionArn = `${FunctionArn}:${functionVersion}`;
        // Update the distribution configuration to add the new Lambda function association
        const newAssociation = {
            EventType: "origin-request",
            LambdaFunctionARN: lambdaFunctionArn,
        };
        const existingAssociations = DistributionConfig.DefaultCacheBehavior.LambdaFunctionAssociations?.Items || [];
        const updatedAssociations = existingAssociations.filter(association => association.EventType !== 'origin-request');
        updatedAssociations.push(newAssociation);
        const updatedLambdaFunctionAssociations = {
            Quantity: updatedAssociations.length,
            Items: updatedAssociations,
        };
        const updatedDistributionConfig = {
            Id: distributionId,
            DistributionConfig: {
                ...DistributionConfig,
                DefaultCacheBehavior: {
                    ...DistributionConfig.DefaultCacheBehavior,
                    LambdaFunctionAssociations: updatedLambdaFunctionAssociations,
                },
            },
            IfMatch: (await cloudFront.send(getDistConfigCommand)).ETag, // Include the ETag to ensure the distribution configuration hasn't changed since it was fetched
        };
        await cloudFront.send(new UpdateDistributionCommand(updatedDistributionConfig));
        console.log('CloudFront trigger set up successfully.');
    }
    catch (error) {
        console.error(`Failed to set up CloudFront trigger: ${error}`);
        throw error;
    }
}
/**
 * Invalidates the cache for the specified paths in the specified CloudFront distribution.
 * @param distributionId The ID of the CloudFront distribution to invalidate the cache for.
 * @param paths An array of paths to invalidate the cache for.
 * @param region The AWS region where the CloudFront distribution is located.
 * @returns A Promise that resolves when the invalidation is complete.
 * @throws An error if the invalidation fails.
 */
async function invalidateCache(distributionId, paths, region) {
    const invalidationBatch = {
        Paths: {
            Quantity: paths.length,
            Items: paths,
        },
        CallerReference: new Date().toISOString(),
    };
    const params = {
        DistributionId: distributionId,
        InvalidationBatch: invalidationBatch,
    };
    const cloudFront = new CloudFrontClient({ region });
    try {
        const result = await cloudFront.send(new CreateInvalidationCommand(params));
        if (result.Invalidation) {
            console.log(`Invalidation created with ID: ${result.Invalidation.Id}`);
        }
    }
    catch (error) {
        console.error(`Failed to create invalidation: ${error}`);
        throw error;
    }
}
export { uploadToS3, deployLambdaFunction, setupCloudFrontTrigger, invalidateCache };
