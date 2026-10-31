export const fixtureManifest: {
  readonly projectId: string;
  readonly fixtureVersion: string;
};
export function validateLocalTarget(value: string): string;
export function createFixtureAdapter(options?: {
  baseUrl?: string; keyFile?: string;
  keyProvider?: () => string | Promise<string>;
  fetchImpl?: typeof fetch; timeoutMs?: number;
}): {
  prepareFixtures(input: { approved: boolean }): Promise<{privateProfile: {privateSessions: Record<string,string>}} >;
  inspectFixture(input: {type:'address' | 'product';resourceId:string}): Promise<Record<string,unknown>>;
  resetFixtures(input: {approved:boolean}): Promise<unknown>;
  expireSyntheticActor(input: {actorId:string}): Promise<unknown>;
};
export const createGroceryAdapter: typeof createFixtureAdapter;
