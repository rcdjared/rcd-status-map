git # RCD Status Map

RCD Status Map is a web app for viewing and managing subdivision lot status on project maps. It includes a lot register for searching, filtering, editing, reviewing history, and exporting lot data.

## Requirements

- Node.js and npm
- Access to a Supabase project

## Run locally

1. Install dependencies:

   ```sh
   npm install
   ```

2. Create a `.env.development` file in the project root and configure your **development** Supabase project:

   ```env
   VITE_SUPABASE_URL=https://your-dev-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-dev-project-anon-key
   ```

3. Start the development server:

   ```sh
   npm run dev
   ```

   Open the local URL printed by Vite (usually `http://localhost:5173`). Vite reloads the app as you edit files.

Environment files are excluded from Git. Do not commit credentials or put a Supabase `service_role` key in this frontend app.

## Development and production environments

Vite selects environment files based on its mode:

| Command | Vite mode | Environment file |
| --- | --- | --- |
| `npm run dev` | development | `.env.development` |
| `npm run build` | production | `.env.production` |

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the matching Supabase project in each environment. For production deployments, configure these variables in the hosting provider's environment settings. Vite embeds `VITE_` variables into the frontend at build time, so rebuild after changing them.

## Checks and builds

```sh
npm test          # Run tests
npm run lint      # Lint TypeScript source
npm run typecheck # Type-check without building
npm run build     # Type-check and create the production bundle in dist/
npm run preview   # Serve the production bundle locally
```

Run `npm run build` before `npm run preview`.

## Deploy

The GitHub Actions workflow runs lint, type-checking, and a production build on pushes and pull requests. To release a frontend change:

1. Create a branch, commit the change, and push it to GitHub.
2. Open a pull request into `main` and wait for CI to pass.
3. Merge the pull request.
4. Deploy the `main` branch through the configured hosting provider. Configure its build command as `npm run build`, publish directory as `dist`, and production Supabase environment variables as described above.

This repository's CI workflow validates the frontend but does not deploy it. A frontend deployment depends on the hosting provider's configuration. Database migrations are separate from frontend releases; the manual Supabase migration workflow should only be run when a database change is required.

## Database migrations

Supabase migrations are stored in `supabase/migrations/`. The GitHub Actions workflow for migrations is manually triggered and requires confirming that production is backed up and ready. It also requires the Supabase project ID, access token, and database password to be configured as GitHub Actions secrets.
