/**
 * PluginRegistry — central registry for all available workflow plugins.
 *
 * Consumed by:
 *   - PluginPalette (list available plugins)
 *   - PropertyPanel (get config schema for selected node)
 *   - PluginNode (get color + handles)
 */

import { PluginManifest } from './plugin-manifest';

class PluginRegistryImpl {
    private manifests = new Map<string, PluginManifest>();

    register(manifest: PluginManifest): void {
        this.manifests.set(manifest.id, manifest);
    }

    get(pluginId: string): PluginManifest | undefined {
        return this.manifests.get(pluginId);
    }

    getAll(): PluginManifest[] {
        return Array.from(this.manifests.values());
    }

    getByCategory(category: PluginManifest['category']): PluginManifest[] {
        return this.getAll().filter(m => m.category === category);
    }
}

/** Singleton plugin registry instance. */
export const pluginRegistry = new PluginRegistryImpl();
