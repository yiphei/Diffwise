/**
 * Anthropic tool (input_schema) definitions per stage — the structured-output
 * contract (§5.2 / §5.4). Each tool's `input_schema` is the JSON Schema for that
 * stage's MODEL slice; forced tool use guarantees the model emits exactly one
 * conforming object (§5.8 rule 3).
 *
 * All object schemas use `additionalProperties: false`. Enums mirror the
 * `@/lib/model/model` unions exactly. StoryTarget is a discriminated union via
 * `oneOf` with ONLY the four v1 types (no `demo`). `level` is an integer enum
 * [0,1,2,3,4].
 */
import type Anthropic from "@anthropic-ai/sdk";
import {
  ARCH_SHAPES,
  CHANGE_KINDS,
  EDGE_TYPES,
  SYMBOL_KINDS,
} from "@/lib/model/model";

type JsonSchema = Anthropic.Tool.InputSchema;

const CHANGE_KIND_ENUM = [...CHANGE_KINDS];
const SYMBOL_KIND_ENUM = [...SYMBOL_KINDS];
const EDGE_TYPE_ENUM = [...EDGE_TYPES];
const ARCH_SHAPE_ENUM = [...ARCH_SHAPES];
const FILE_STATUS_ENUM = ["added", "deleted", "modified", "renamed"];

/** `{ file, sym }` structured cross-link used inside relations. */
const jumpRefSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    file: { type: "string" },
    sym: { type: "string" },
  },
  required: ["file", "sym"],
} as const;

// ---------------------------------------------------------------------------
// intent → { meta:{title,summary}, themes:[{label,kind}] }
// ---------------------------------------------------------------------------

export const intentTool: Anthropic.Tool = {
  name: "emit_intent",
  description: "Emit the PR title/summary and 3–7 theme chips.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      meta: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string", maxLength: 120 },
          summary: { type: "string" },
        },
        required: ["title", "summary"],
      },
      themes: {
        type: "array",
        maxItems: 7,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            label: { type: "string" },
            kind: { type: "string", enum: CHANGE_KIND_ENUM },
          },
          required: ["label", "kind"],
        },
      },
    },
    required: ["meta", "themes"],
  } as unknown as JsonSchema,
};

// ---------------------------------------------------------------------------
// files → { files:[{path,status,summary,kinds}] }  (no symbols here)
// ---------------------------------------------------------------------------

export const filesTool: Anthropic.Tool = {
  name: "emit_files",
  description: "Emit one card per changed file (no symbols).",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      files: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            path: { type: "string" },
            status: { type: "string", enum: FILE_STATUS_ENUM },
            summary: { type: "string" },
            kinds: {
              type: "array",
              items: { type: "string", enum: CHANGE_KIND_ENUM },
            },
          },
          required: ["path", "status", "summary", "kinds"],
        },
      },
    },
    required: ["files"],
  } as unknown as JsonSchema,
};

// ---------------------------------------------------------------------------
// symbols → { byFile:[{path,symbols:[Symbol]}] }
// ---------------------------------------------------------------------------

const symbolSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string" },
    kind: { type: "string", enum: SYMBOL_KIND_ENUM },
    change: { type: "string", enum: CHANGE_KIND_ENUM },
    renamedFrom: { type: "string" },
    hunks: {
      type: "array",
      items: { type: "integer", minimum: 0 },
    },
    detail: { type: "string" },
  },
  required: ["name", "kind", "change", "hunks", "detail"],
} as const;

export const symbolsTool: Anthropic.Tool = {
  name: "emit_symbols",
  description: "Emit the meaningful symbols that changed, grouped by file.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      byFile: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            path: { type: "string" },
            symbols: { type: "array", items: symbolSchema },
          },
          required: ["path", "symbols"],
        },
      },
    },
    required: ["byFile"],
  } as unknown as JsonSchema,
};

// ---------------------------------------------------------------------------
// relations → { relations:[Relation] }
// ---------------------------------------------------------------------------

export const relationsTool: Anthropic.Tool = {
  name: "emit_relations",
  description: "Emit refactor-trace relations (may be empty for additive PRs).",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      relations: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            tagKind: { type: "string", enum: CHANGE_KIND_ENUM },
            source: { type: "string" },
            sourceTarget: jumpRefSchema,
            edges: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  what: { type: "string" },
                  to: { type: "string" },
                  target: jumpRefSchema,
                },
                required: ["what", "to"],
              },
            },
          },
          required: ["title", "tagKind", "source", "edges"],
        },
      },
    },
    required: ["relations"],
  } as unknown as JsonSchema,
};

// ---------------------------------------------------------------------------
// arch → { nodes, edges, netEffect }  (STATIC: before/after only)
// ---------------------------------------------------------------------------

const archNodeStateSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    x: { type: "number", minimum: 0, maximum: 1 },
    y: { type: "number", minimum: 0, maximum: 1 },
    present: { type: "boolean" },
  },
  required: ["x", "y", "present"],
} as const;

const archEdgeStateSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    present: { type: "boolean" },
    from: { type: "string" },
    to: { type: "string" },
  },
  required: ["present"],
} as const;

export const archTool: Anthropic.Tool = {
  name: "emit_arch",
  description: "Emit a small static before→after wiring diagram.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      nodes: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            id: { type: "string" },
            label: { type: "string" },
            sub: { type: "string" },
            kind: { type: "string", enum: CHANGE_KIND_ENUM },
            shape: { type: "string", enum: ARCH_SHAPE_ENUM },
            states: {
              type: "object",
              additionalProperties: false,
              properties: {
                before: archNodeStateSchema,
                after: archNodeStateSchema,
              },
              required: ["before", "after"],
            },
            jump: { type: "string" },
            caption: { type: "string" },
          },
          required: ["id", "label", "sub", "kind", "shape", "states"],
        },
      },
      edges: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            id: { type: "string" },
            from: { type: "string" },
            to: { type: "string" },
            type: { type: "string", enum: EDGE_TYPE_ENUM },
            label: { type: "string" },
            states: {
              type: "object",
              additionalProperties: false,
              properties: {
                before: archEdgeStateSchema,
                after: archEdgeStateSchema,
              },
              required: ["before", "after"],
            },
            metric: {
              type: "object",
              additionalProperties: false,
              properties: {
                before: { type: "string" },
                after: { type: "string" },
              },
              required: ["before", "after"],
            },
          },
          required: ["id", "from", "to", "type", "label", "states"],
        },
      },
      netEffect: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            label: { type: "string" },
            kind: { type: "string", enum: CHANGE_KIND_ENUM },
            jump: { type: "string" },
          },
          required: ["label", "kind"],
        },
      },
    },
    required: ["nodes", "edges", "netEffect"],
  } as unknown as JsonSchema,
};

// ---------------------------------------------------------------------------
// story → { story:[StoryBeat] }  (StoryTarget oneOf, four v1 types only)
// ---------------------------------------------------------------------------

const storyTargetSchema = {
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      properties: { type: { const: "relations" } },
      required: ["type"],
    },
    {
      type: "object",
      additionalProperties: false,
      properties: { type: { const: "arch" } },
      required: ["type"],
    },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        type: { const: "symbol" },
        file: { type: "string" },
        name: { type: "string" },
      },
      required: ["type", "file", "name"],
    },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        type: { const: "file" },
        file: { type: "string" },
      },
      required: ["type", "file"],
    },
  ],
} as const;

export const storyTool: Anthropic.Tool = {
  name: "emit_story",
  description: "Emit a guided sequence of 4–8 story beats.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      story: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            id: { type: "string" },
            kind: { type: "string", enum: CHANGE_KIND_ENUM },
            level: { type: "integer", enum: [0, 1, 2, 3, 4] },
            title: { type: "string" },
            body: { type: "string" },
            target: storyTargetSchema,
            asides: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  label: { type: "string" },
                  body: { type: "string" },
                },
                required: ["label", "body"],
              },
            },
          },
          required: ["id", "kind", "level", "title", "body", "target", "asides"],
        },
      },
    },
    required: ["story"],
  } as unknown as JsonSchema,
};

/** All stage tools, keyed by StageName. */
export const STAGE_TOOLS = {
  intent: intentTool,
  files: filesTool,
  symbols: symbolsTool,
  relations: relationsTool,
  arch: archTool,
  story: storyTool,
} as const;
