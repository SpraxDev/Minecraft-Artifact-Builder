import ArtifactBuilder from './ArtifactBuilder.ts';
import MojangArtifactBuilder from './mojang.com/MojangArtifactBuilder.ts';
import FoliaArtifactBuilder from './papermc.io/FoliaArtifactBuilder.ts';
import PaperArtifactBuilder from './papermc.io/PaperArtifactBuilder.ts';
import TravertineArtifactBuilder from './papermc.io/TravertineArtifactBuilder.ts';
import VelocityArtifactBuilder from './papermc.io/VelocityArtifactBuilder.ts';
import WaterfallArtifactBuilder from './papermc.io/WaterfallArtifactBuilder.ts';
import PufferfischArtifactBuilder from './pufferfish.host/PufferfischArtifactBuilder.ts';
import PurpurArtifactBuilder from './purpurmc.org/PurpurArtifactBuilder.ts';
import SpigotArtifactBuilder from './spigotmc.org/SpigotArtifactBuilder.ts';

export default class ArtifactBuilderRegistry {
  private readonly builders: Map<string, ArtifactBuilder> = new Map();

  constructor() {
    this.register('spigotmc.org/spigot', new SpigotArtifactBuilder());

    this.register('papermc.io/folia', new FoliaArtifactBuilder());
    this.register('papermc.io/paper', new PaperArtifactBuilder());
    this.register('papermc.io/travertine', new TravertineArtifactBuilder());
    this.register('papermc.io/velocity', new VelocityArtifactBuilder());
    this.register('papermc.io/waterfall', new WaterfallArtifactBuilder());

    this.register('purpurmc.org/purpur', new PurpurArtifactBuilder());

    this.register('pufferfish.host', new PufferfischArtifactBuilder());

    this.register('mojang.com', new MojangArtifactBuilder());
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
