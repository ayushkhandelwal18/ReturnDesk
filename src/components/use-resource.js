"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/browser-api";

export function useResource(path) {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState(null);
  const key = `${path}:${revision}`;
  useEffect(() => {
    const controller = new AbortController();
    apiRequest(path, { signal: controller.signal }).then(
      (data) => {
        if (!controller.signal.aborted) setResult({ key, data });
      },
      (error) => {
        if (!controller.signal.aborted) setResult({ key, error });
      },
    );
    return () => controller.abort();
  }, [path, key]);
  return {
    data: result?.key === key ? result.data : null,
    error: result?.key === key ? result.error : null,
    loading: result?.key !== key,
    refresh: () => setRevision((value) => value + 1),
  };
}
