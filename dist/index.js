import fs from "node:fs";
import { fileURLToPath } from "node:url";
const __dirname = fileURLToPath(new URL(".", import.meta.url));
import { build } from "esbuild";
import * as path from "path";
import { cp, rm, } from "fs/promises";
import { existsSync } from "node:fs";
import archiver from 'archiver';
import { uploadToS3, deployLambdaFunction, setupCloudFrontTrigger, invalidateCache } from "./aws.js";
/**
 * Default configuration for AWS resources.
 */
const defaultConfig = {
    s3: { bucketName: "", prefix: "", region: "ap-south-1" },
    lambda: { functionName: "", region: "us-east-1" },
    cloudfront: { distributionId: "", region: "us-east-1" }
};
/**
 * Compresses a directory into a zip file.
 * @param source - The path of the directory to be compressed.
 * @param out - The path of the output zip file.
 * @returns A Promise that resolves when the compression is complete.
 */
async function zipDirectory(source, out) {
    const archive = archiver('zip', { zlib: { level: 9 } }); // Sets the compression level.
    console.log("Zipping....", source, out);
    const stream = fs.createWriteStream(out);
    return new Promise((resolve, reject) => {
        const outputFileName = path.basename(out); // Extract the file name from the output path
        archive
            .glob('**/*', {
            cwd: source,
            ignore: [outputFileName] // Ignore the file with the name specified in the out parameter
        })
            .on('error', err => reject(err))
            .pipe(stream);
        stream.on('close', () => resolve());
        archive.finalize();
    });
}
/**
 * Bundles the SvelteKit app for deployment to AWS Lambda.
 * @returns {Promise<void>}
 */
async function bundleApp() {
    await rm(path.join("build"), { recursive: true, force: true });
    await build({
        entryPoints: [path.join("out", "server", "lambda-handler", "index.js")],
        bundle: true,
        platform: "node",
        target: ["esnext"],
        format: "esm",
        outExtension: {
            ".js": ".mjs",
        },
        banner: {
            js: [
                `import { createRequire as topLevelCreateRequire } from 'module';`,
                `const require = topLevelCreateRequire(import.meta.url);`,
            ].join(""),
        },
        outdir: path.join("build"),
    });
    if (existsSync(path.join("out", "prerendered"))) {
        await cp(path.join("out", "prerendered"), path.join("build", "prerendered"), {
            recursive: true,
        });
    }
    else {
        console.log("No Prerendered Directory found.");
    }
    console.log("BUILD SUCEEDED!");
}
/**
 * AWS adapter function for SvelteKit
 * @param configInput - Configuration object for AWS
 * @returns SvelteKit adapter object
 */
function adapter(configInput) {
    const adapter = {
        name: "@juspay/sveltekit-aws-adapter",
        async adapt(builder) {
            console.log("Building...");
            const out = path.join("out");
            const clientDir = path.join(out, "client");
            const serverDir = path.join(out, "server");
            const prerenderedDir = path.join(out, "prerendered");
            const config = deepMerge(defaultConfig, configInput);
            // Cleanup output folder
            builder.rimraf(out);
            // Create static output
            builder.log.minor("Copying assets...");
            builder.writeClient(clientDir);
            const prerenderedFiles = builder.writePrerendered(prerenderedDir);
            // Create Lambda function
            builder.log.minor("Generating server function...");
            builder.writeServer(serverDir);
            // copy over handler files in server handler folder
            builder.copy(path.join(__dirname, "handler"), path.join(serverDir, "lambda-handler"));
            // save a list of files in server handler folder
            fs.writeFileSync(path.join(serverDir, "lambda-handler", "prerendered-file-list.js"), `export default ${JSON.stringify(prerenderedFiles)}`);
            await bundleApp();
            await uploadToS3(clientDir, config.s3.bucketName, config.s3.prefix, config.s3.region);
            await zipDirectory(path.join("build"), path.join("build") + "/lambda.zip")
                .then(() => console.log('Directory successfully zipped!'))
                .catch(error => console.error('Failed to zip directory:', error));
            const lambdaVersion = await deployLambdaFunction(config.lambda.functionName, path.join("build") + "/lambda.zip", config.lambda.region);
            if (lambdaVersion !== undefined) {
                await setupCloudFrontTrigger(config.lambda.functionName, lambdaVersion, config.cloudfront.distributionId, config.cloudfront.region);
            }
            await invalidateCache(config.cloudfront.distributionId, ["/*"], config.cloudfront.region);
        },
    };
    return adapter;
}
/**
 * Recursively merges two objects into a single object.
 * @param target - The target object to merge into.
 * @param source - The source object to merge from.
 * @returns The merged object.
 * @throws An error if either target or source is not an object.
 */
function deepMerge(target, source) {
    const isObject = (obj) => obj && typeof obj === 'object';
    if (!isObject(target) || !isObject(source)) {
        throw new Error('Invalid arguments: Both target and source must be objects');
    }
    Object.keys(source).forEach(key => {
        const targetValue = target[key];
        const sourceValue = source[key];
        if (isObject(targetValue) && isObject(sourceValue)) {
            target[key] = deepMerge(Object.assign({}, targetValue), sourceValue);
        }
        else {
            target[key] = sourceValue ? sourceValue : targetValue;
        }
    });
    return target;
}
export { adapter };
