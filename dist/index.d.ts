import type { Builder } from "@sveltejs/kit";
/**
 * Configuration options for connecting to an S3 bucket.
 */
interface S3Config {
    /**
     * The name of the S3 bucket to use.
     */
    bucketName: string;
    /**
     * The prefix to use for all object keys in the bucket.
     */
    prefix: string;
    /**
     * The AWS region where the S3 bucket is located.
     */
    region: string;
}
/**
 * Configuration options for AWS Lambda function.
 */
interface LambdaConfig {
    /**
     * Name of the AWS Lambda function.
     */
    functionName: string;
    /**
     * AWS region where the Lambda function is deployed.
     */
    region: string;
}
/**
 * Configuration options for the AWS CloudFront adapter.
 */
interface CloudFrontConfig {
    /**
     * The ID of the CloudFront distribution to use.
     */
    distributionId: string;
    /**
     * The AWS region in which the CloudFront distribution is located.
     */
    region: string;
}
/**
 * Configuration object for AWS services.
 */
interface AWSConfiguration {
    /**
     * Configuration object for Amazon S3.
     */
    s3: S3Config;
    /**
     * Configuration object for AWS Lambda.
     */
    lambda: LambdaConfig;
    /**
     * Configuration object for Amazon CloudFront.
     */
    cloudfront: CloudFrontConfig;
}
/**
 * AWS adapter function for SvelteKit
 * @param configInput - Configuration object for AWS
 * @returns SvelteKit adapter object
 */
declare function adapter(configInput: AWSConfiguration): {
    name: string;
    adapt(builder: Builder): Promise<void>;
};
export { adapter, AWSConfiguration };
