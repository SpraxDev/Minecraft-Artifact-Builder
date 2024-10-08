import ArtifactBuilder from './ArtifactBuilder';
import MojangArtifactBuilder from './mojang.com/MojangArtifactBuilder';
import FoliaArtifactBuilder from './papermc.io/FoliaArtifactBuilder';
import PaperArtifactBuilder from './papermc.io/PaperArtifactBuilder';
import TravertineArtifactBuilder from './papermc.io/TravertineArtifactBuilder';
import VelocityArtifactBuilder from './papermc.io/VelocityArtifactBuilder';
import WaterfallArtifactBuilder from './papermc.io/WaterfallArtifactBuilder';
import PufferfischArtifactBuilder from './pufferfish.host/PufferfischArtifactBuilder';
import PurpurArtifactBuilder from './purpurmc.org/PurpurArtifactBuilder';
import SpigotArtifactBuilder from './spigotmc.org/SpigotArtifactBuilder';

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
