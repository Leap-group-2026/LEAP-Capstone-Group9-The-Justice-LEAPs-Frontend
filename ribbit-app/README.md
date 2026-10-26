# Ribbit App

A modern, responsive investment trading platform built with Angular 22+.

## Quick Start

### Prerequisites
- Node.js 18+ installed
- npm 11.16.0 or higher

### Installation

1. Navigate to the project directory:
```bash
cd ribbit-app
```

2. Install dependencies:
```bash
npm install
```

### Running the Application

Start the development server:
```bash
npm start
```

The application will be available at `http://localhost:4200/`. The app automatically reloads when you modify source files.

### Build for Production

Create an optimized production build:
```bash
npm run build
```

Output will be in the `dist/ribbit-app` directory.

## S3 and CloudFront deployment

Run `npm run build:s3` from this directory. This produces a browser-only
production build in `dist/ribbit-app-s3/browser`, including a root `index.html`.
The existing production/Docker SSR build is unchanged. No HTML renaming is needed.

1. In the S3 upload screen, remove the pending upload whose folder is `browser/`.
2. Open `dist/ribbit-app-s3/browser` locally, select all files inside it, and
	upload those contents to the bucket root, not the enclosing `browser` folder.
	Upload any generated asset subfolders too, preserving their relative paths.
3. Use the bucket's S3 REST origin in CloudFront, with Origin Access Control
	(OAC). Keep S3 Block Public Access enabled and apply the bucket policy
	CloudFront provides to allow that distribution to read objects.
	S3 static website hosting is not required for this setup.
4. Leave the CloudFront origin path empty when files are at the bucket root.
	Set the distribution's default root object to `index.html` and its viewer
	protocol policy to redirect HTTP to HTTPS.
5. For a distribution serving only this frontend, add custom error responses
	for both HTTP 403 and 404: response page `/index.html`, response code 200,
	and error caching minimum TTL 0. This lets Angular handle routes such as
	`/login` and `/dashboard`, including browser refreshes. Do not apply this
	fallback to a shared API distribution without isolating API error handling.
6. After replacing an existing deployment, invalidate `/*` in CloudFront.
7. Test the CloudFront HTTPS URL, then open `/login` directly and refresh it.

Before expecting sign-in or data requests to work, set `authUrl` and `springUrl`
in `src/app/environments/environment.ts` to browser-reachable HTTPS API endpoints
and rebuild. Private `10.x.x.x` addresses require access to that private network;
HTTP API calls are blocked from an HTTPS frontend as mixed content. Configure
backend CORS to allow the CloudFront/custom-domain frontend origin. Docker build
arguments and the Docker environment-generation script are not automatically
used by `npm run build:s3`. Frontend configuration must never contain secrets.

## Docker deployment configuration

Copy the tracked .env.example template to .env in this directory on another
machine, then edit AUTH_URL and SPRING_URL for that deployment. FRONTEND_PORT
sets the host port (default 8083), and APP_VERSION sets the frontend version.
The local .env file is ignored by Git and excluded from the Docker build context.

Docker Compose automatically reads .env and passes the API URLs as build arguments.
The Dockerfile generates the Angular production environment before building, so a
local production environment file is not required on a fresh checkout.
Build and start the ribbit-app Compose service with the build option enabled.
API URLs are compiled into the browser bundle: changing .env requires rebuilding
and recreating the container, not just restarting it. These values are public;
never put passwords, tokens, or other secrets in frontend configuration.

The URLs must be reachable from users' browsers, not just from the container.
The example private IP requires access to that network. Use HTTPS API URLs when
hosting the frontend over HTTPS, and allow the frontend origin in backend CORS.

## Development server

To start the development server, run:

```bash
ng serve
```

Or using npm:

```bash
npm start
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
