# Repository Guidelines

## Project Structure & Module Organization
`src/` contains the application entry point and runtime code. Use `src/controllers/` for request handlers, `src/routes/` for Fastify route registration, `src/services/` for Baileys and business logic, `src/lib/` for shared infrastructure such as Prisma, and `src/views/` for the admin panel output. Database schema and SQLite state live in `prisma/` (`schema.prisma`, `dev.db`). WhatsApp auth artifacts are stored in `sessions/` and should stay out of commits.

## Build, Test, and Development Commands
Run commands from the repository root:

- `npm install` installs dependencies.
- `npm run setup` installs packages, pushes the Prisma schema, and generates the Prisma client.
- `npm run dev` starts the Fastify server with `node --watch`.
- `npm start` runs the server without file watching.
- `npm run db:push` syncs schema changes to the local SQLite database.
- `npm run db:generate` regenerates Prisma client code after schema updates.
- `npm run db:migrate` creates a named development migration.

## Coding Style & Naming Conventions
This project uses ESM JavaScript with 2-space indentation, single quotes, and no semicolons. Match the existing file naming: `*.controller.js`, `*.routes.js`, and `*.service.js`. Prefer small route modules and keep transport-specific logic in services. Use clear session-oriented names such as `sessionId`, `authDir`, and `sendTextMessage`.

## Testing Guidelines
There is no automated test suite configured yet. Before opening a PR, verify changes by running `npm run dev`, calling the affected endpoints, and checking `/health` plus the admin panel at `http://localhost:3000/panel`. When adding tests, place them under a new `tests/` directory and name files `*.test.js`.

## Commit & Pull Request Guidelines
Git history is not available in this workspace, so no repository-specific commit convention could be confirmed. Use short, imperative commit messages such as `Add file upload validation` or `Fix session reconnect status`. PRs should include a clear summary, impacted endpoints or files, any Prisma or `.env` changes, and screenshots for panel updates.

## Security & Configuration Tips
Keep `.env` local and derive new keys from `.env.example`. Do not commit `sessions/` contents or `prisma/dev.db` data snapshots with real credentials. Review file-size limits carefully before changing upload handling; the server currently accepts large multipart payloads.
