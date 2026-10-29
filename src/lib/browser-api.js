export async function apiRequest(path, { body, ...options } = {}) {
  const response = await fetch(`/api/requests${path}`, {
    ...options,
    cache: "no-store",
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    const details = json?.error?.details
      ?.map((issue) => `${issue.path?.join(".") || "Input"}: ${issue.message}`)
      .join(" ");
    const error = new Error(
      [
        json?.error?.message ||
          `Request failed (${response.status}). Please try again.`,
        details,
      ]
        .filter(Boolean)
        .join(" "),
    );
    error.status = response.status;
    throw error;
  }
  if (!json || !("data" in json))
    throw new Error(
      "The server returned an unexpected response. Please try again.",
    );
  return json.data;
}
