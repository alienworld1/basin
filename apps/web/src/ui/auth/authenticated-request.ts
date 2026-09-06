type AccessTokenSource = () => Promise<string | null>;

const pause = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function authenticatedRequest(
  getAccessToken: AccessTokenSource,
  input: RequestInfo | URL,
  init: RequestInit = {},
) {
  const request = async () => {
    const token = await getAccessToken();
    if (!token) return null;
    return fetch(input, {
      ...init,
      cache: "no-store",
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
    });
  };

  let response = await request();
  if (response?.status === 401) {
    await pause(250);
    response = await request();
  }
  return response;
}
