# Contributing to Distributed Task Platform

First off, thank you for considering contributing to the Distributed Task Platform! It's people like you that make open source such a great community.

## Development Environment Setup

1. **Prerequisites**: Node.js 18+, Docker Desktop, Git.
2. **Install Dependencies**: Run `npm install` at the root and inside each service in `apps/` and `services/`.
3. **Database Setup**: Start the infrastructure with `docker compose up -d postgres redis`. Run `npx prisma migrate dev` inside `services/api-service`.
4. **Local Services**: Start the services individually for development (see README for commands).

## Adding a New Plugin

If you want to add a new task type:
1. Create a directory in `plugins/your-plugin`.
2. Define a `manifest.ts` implementing `PluginManifest`.
3. Export an executor function.
4. Register your plugin in `runtime/plugins/builtin.ts`.

## Pull Request Process

1. Ensure any install or build dependencies are removed before the end of the layer when doing a build.
2. Update the README.md with details of changes to the interface, this includes new environment variables, exposed ports, useful file locations and container parameters.
3. Your PR must pass the CI workflow (`ci.yml`), including linting and tests.
4. You may merge the Pull Request in once you have the sign-off of two other developers, or if you do not have permission to do that, you may request the second reviewer to merge it for you.
