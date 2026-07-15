/** DOM page-translate privacy/fidelity suite hooks. */
export function assertNoRemoteMtEndpoint(url: string): boolean {
  const denied = ["translate.googleapis.com", "api.deepl.com", "api.openai.com"];
  try {
    const host = new URL(url).hostname;
    return !denied.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}
