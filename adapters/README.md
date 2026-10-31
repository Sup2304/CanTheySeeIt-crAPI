# Application adapters (none installed)

Snehal should supply a trusted adapter implementing `TargetAdapter` from `src/adapter.ts`.
A tested adapter must be locally registered in `src/server.ts`. This is the ONLY place
that contains app-specific endpoint paths, temporary sessions, fixture IDs, exact
private markers, snapshot logic, mutation bodies, and restoration procedures.

Do not accept session values, arbitrary target URLs, local file paths, or raw PATCH
bodies from the frontend. The adapter may operate only on disposable fake data.

For onboarding, document the complete boundary and readiness contract. The current
package has intentionally NO adapter, because the team's real local grocery
service has not been supplied yet.
