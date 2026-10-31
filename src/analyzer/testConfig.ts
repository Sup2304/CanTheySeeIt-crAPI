export type Permission = "allow" | "deny";

export interface TestActor {
  id: string;
  headers: Record<string, string>;
}

export interface PermissionTest {
  id: string;
  method: "GET" | "HEAD";
  path: string;
  actor: string;
  expected: Permission;
}

export interface GenericTestConfig {
  baseUrl: string;
  actors: TestActor[];
  tests: PermissionTest[];
}
