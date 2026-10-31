// Connectivity check only. This does NOT run any authorization/security tests.
const target = 'http://127.0.0.1:8888/';
try {
  const res = await fetch(target, { redirect: 'manual', signal: AbortSignal.timeout(3000) });
  console.log(JSON.stringify({ target, reachable: true, httpStatus: res.status, securityTestsRun: 0 }, null, 2));
  if (res.status >= 500) process.exitCode = 1;
  await res.body?.cancel();
} catch {
  console.error('crAPI is not reachable on 127.0.0.1:8888. Start the isolated local Docker lab before integration.');
  process.exitCode = 1;
}
