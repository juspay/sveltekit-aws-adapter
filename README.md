# AWS adapter for SvelteKit

An adapter to build a [SvelteKit](https://kit.svelte.dev/) app into a lambda ready for deployment with cloudfront lambda@edge.

## Installation
```
npm install --save-dev @juspay/sveltekit-aws-adapter
```

## Usage

In your `svelte.config.js` configure the adapter as bellow;

```js
import preprocess from 'svelte-preprocess';
import adapter from '@juspay/sveltekit-aws-adapter';

const config = {
  preprocess: preprocess(),
  kit: {
    adapter: adapter(),
  },
};

export default config;
```
### build.js

```js
import {bundleApp} from "sveltekit-lambda-adapter"
bundleApp()
```
## Build app

Generates the required files in a folder `out`.
To be added to .gitignore for CI/CD systems.

```bash
pnpm run build
```
```bash
node build.js
```
