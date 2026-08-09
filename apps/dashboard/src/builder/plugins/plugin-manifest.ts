/**
 * PluginManifest — declarative metadata for a workflow plugin.
 *
 * Drives the entire Builder UI:
 *   - PluginPalette (list of draggable plugins)
 *   - PluginNode (color, handles, label)
 *   - PropertyPanel (config fields)
 *
 * Adding a new plugin requires ZERO UI code — only a manifest.
 */

export interface PluginFieldSchema {
    /** Property key in TaskDefinition.config */
    key: string;

    /** Field type determines the renderer. */
    type: 'string' | 'number' | 'boolean' | 'select' | 'json' | 'textarea';

    /** Human-readable label. */
    title: string;

    /** Default value for new nodes. */
    default?: any;

    /** Options for 'select' type fields. */
    options?: string[];

    /** Whether this field is required. */
    required?: boolean;

    /** Placeholder text. */
    placeholder?: string;
}

export interface PluginManifest {
    /** Plugin identifier (e.g. 'core/http'). */
    id: string;

    /** Human-readable name (e.g. 'HTTP Request'). */
    name: string;

    /** Category for palette grouping. */
    category: 'triggers' | 'actions' | 'logic' | 'integrations';

    /** Plugin semantic version. */
    pluginVersion: string;

    /** Minimum runtime version required to execute this plugin. */
    minimumRuntimeVersion: string;

    /** Config schema version for migration support. */
    schemaVersion: number;

    /** Tailwind color classes for node rendering. */
    color: {
        bg: string;
        border: string;
        text: string;
    };

    /** Handle configuration for ReactFlow node. */
    handles: {
        inputs: string[];    // e.g. ['default']
        outputs: string[];   // e.g. ['default'] or ['true', 'false']
    };

    /** Configuration schema — drives PropertyPanel field generation. */
    configSchema: PluginFieldSchema[];
}
