import type { AuthBootstrapResult } from "../shell-types";
import { authenticatedRequest } from "./authenticated-request";

type AccessTokenSource = () => Promise<string | null>;

const inFlightBootstraps = new WeakMap<
  AccessTokenSource,
  Promise<Response | null>
>();

const pause = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function requestBootstrap(
  getAccessToken: AccessTokenSource,
) {
  const execute = () =>
    authenticatedRequest(getAccessToken, "/api/auth/bootstrap", {
      method: "POST",
    });
  let inFlight = inFlightBootstraps.get(getAccessToken);
  if (!inFlight) {
    inFlight = execute().finally(() => {
      if (inFlightBootstraps.get(getAccessToken) === inFlight) {
        inFlightBootstraps.delete(getAccessToken);
      }
    });
    inFlightBootstraps.set(getAccessToken, inFlight);
  }
  let response = (await inFlight)?.clone() ?? null;

  for (let retry = 0; response?.status === 429 && retry < 2; retry += 1) {
    const retryAfter = Number(response.headers.get("retry-after"));
    await pause(
      Number.isFinite(retryAfter) ? retryAfter * 1000 : 300 * 2 ** retry,
    );
    response = await execute();
  }
  return response;
}

export async function readBootstrap(response: Response) {
  return (await response.json()) as AuthBootstrapResult;
}
