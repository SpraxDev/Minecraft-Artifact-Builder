import Path from 'node:path';
import Url from 'node:url';
import ArtifactBuilderRegistry from './artifactBuilder/ArtifactBuilderRegistry.ts';

let artifactBuilderRegistry: ArtifactBuilderRegistry;

const __dirname = Url.fileURLToPath(new URL('.', import.meta.url));
export const APP_ROOT = Path.resolve(__dirname, '..');
export const IS_PRODUCTION = process.env.NODE_ENV?.toLowerCase() === 'production';

export function getArtifactBuilderRegistry(): ArtifactBuilderRegistry {
  if (artifactBuilderRegistry == null) {
    artifactBuilderRegistry = new ArtifactBuilderRegistry();
  }
  return artifactBuilderRegistry;
}
