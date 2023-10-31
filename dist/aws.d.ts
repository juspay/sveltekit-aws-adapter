/**
 * Uploads all files in a directory to an S3 bucket with the specified prefix.
 * @param directoryPath - The path to the directory containing the files to upload.
 * @param bucketName - The name of the S3 bucket to upload the files to.
 * @param s3Prefix - The prefix to add to the S3 object keys.
 * @param region - The AWS region where the S3 bucket is located.
 */
declare function uploadToS3(directoryPath: string, bucketName: string, s3Prefix: string, region: string): Promise<void>;
/**
 * Deploys a Lambda function with the given name and zip file path to the specified region.
 * @param functionName - The name of the Lambda function to deploy.
 * @param zipFilePath - The file path of the zip file containing the Lambda function code.
 * @param region - The AWS region to deploy the Lambda function to.
 * @returns The version of the deployed Lambda function.
 */
declare function deployLambdaFunction(functionName: string, zipFilePath: string, region: string): Promise<string | undefined>;
/**
 * Sets up a CloudFront trigger for a Lambda function.
 * @param functionName - The name of the Lambda function.
 * @param functionVersion - The version of the Lambda function.
 * @param distributionId - The ID of the CloudFront distribution.
 * @param region - The AWS region in which the resources are located.
 * @throws An error if the DistributionConfig or DefaultCacheBehavior is missing.
 */
declare function setupCloudFrontTrigger(functionName: string, functionVersion: string, distributionId: string, region: string): Promise<void>;
/**
 * Invalidates the cache for the specified paths in the specified CloudFront distribution.
 * @param distributionId The ID of the CloudFront distribution to invalidate the cache for.
 * @param paths An array of paths to invalidate the cache for.
 * @param region The AWS region where the CloudFront distribution is located.
 * @returns A Promise that resolves when the invalidation is complete.
 * @throws An error if the invalidation fails.
 */
declare function invalidateCache(distributionId: string, paths: string[], region: string): Promise<void>;
export { uploadToS3, deployLambdaFunction, setupCloudFrontTrigger, invalidateCache };
