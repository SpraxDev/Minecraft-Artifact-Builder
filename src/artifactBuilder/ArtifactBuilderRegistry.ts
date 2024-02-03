import ArtifactBuilder from './ArtifactBuilder';
import SpigotArtifactBuilder from './spigot/SpigotArtifactBuilder';

export default class ArtifactBuilderRegistry {
  private readonly builders: Map<string, ArtifactBuilder> = new Map();

  constructor() {
    this.register('spigot', new SpigotArtifactBuilder());
  }

  register(name: string, builder: ArtifactBuilder): void {
    this.builders.set(name, builder);
  }

  get(name: string): ArtifactBuilder | undefined {
    return this.builders.get(name);
  }

  remove(name: string): boolean {
    return this.builders.delete(name);
  }

  getNames(): string[] {
    return Array.from(this.builders.keys());
  }
}
