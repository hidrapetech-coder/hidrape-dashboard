import type { getAxiosImplementation } from './framework.js';

type AxiosImpl = Awaited<ReturnType<typeof getAxiosImplementation>>;
type AxiosPaths = AxiosImpl["paths"];

export function getDefaultPath(paths: AxiosPaths): string | undefined {
  if ("BLOCKS" in paths) return paths.BLOCKS;
  if ("CURRENT_REGISTRY_PATH" in paths) return paths.CURRENT_REGISTRY_PATH;
  if ("NEW_YORK_V4_PATH" in paths) return paths.NEW_YORK_V4_PATH;
  return undefined;
}
