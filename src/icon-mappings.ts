import type { IconMappingEntry } from "./types";

/**
 * 跨图标库映射表
 *
 * 此文件由 scripts/build-mappings.ts 自动生成。
 * 编辑请改 raw-assets/icon-mappings.source.json。
 */
export const iconMappings = <const>[
  {
    "usageName": "arrow-line-down",
    "collections": {
      "snowui": {
        "iconName": "arrow-line-down",
        "status": "matched"
      },
      "phosphor": {
        "iconName": "arrow-line-down",
        "status": "matched"
      }
    }
  },
  {
    "usageName": "arrow-line-left",
    "collections": {
      "snowui": {
        "iconName": "arrow-line-left",
        "status": "matched"
      },
      "phosphor": {
        "iconName": "arrow-line-left",
        "status": "matched"
      }
    }
  },
  {
    "usageName": "arrow-line-right",
    "collections": {
      "snowui": {
        "iconName": "arrow-line-right",
        "status": "matched"
      },
      "phosphor": {
        "iconName": "arrow-line-right",
        "status": "matched"
      }
    }
  },
  {
    "usageName": "arrow-line-up",
    "collections": {
      "snowui": {
        "iconName": "arrow-line-up",
        "status": "matched"
      },
      "phosphor": {
        "iconName": "arrow-line-up",
        "status": "matched"
      }
    }
  },
  {
    "usageName": "arrow-right",
    "collections": {
      "snowui": {
        "iconName": "arrow-right",
        "status": "matched"
      },
      "phosphor": {
        "iconName": "arrow-right",
        "status": "matched"
      }
    }
  },
  {
    "usageName": "arrows-down-up",
    "collections": {
      "snowui": {
        "iconName": "arrows-down-up",
        "status": "matched"
      },
      "phosphor": {
        "iconName": "arrows-down-up",
        "status": "matched"
      }
    }
  },
  {
    "usageName": "clipboard",
    "collections": {
      "snowui": {
        "iconName": "clipboard",
        "status": "matched"
      },
      "phosphor": {
        "iconName": "clipboard",
        "status": "matched"
      }
    }
  },
  {
    "usageName": "copy",
    "collections": {
      "snowui": {
        "iconName": "copy",
        "status": "matched"
      },
      "phosphor": {
        "iconName": "copy",
        "status": "matched"
      }
    }
  },
  {
    "usageName": "star-four",
    "collections": {
      "snowui": {
        "iconName": "star-four",
        "status": "matched"
      },
      "phosphor": {
        "iconName": "star-four",
        "status": "matched"
      }
    }
  },
  {
    "usageName": "x-circle",
    "collections": {
      "snowui": {
        "iconName": "x-circle",
        "status": "matched"
      },
      "phosphor": {
        "iconName": "x-circle",
        "status": "matched"
      }
    }
  }
] satisfies readonly IconMappingEntry[];

export function findIconMapping(usageName: string): IconMappingEntry | undefined {
  return iconMappings.find((m) => m.usageName === usageName);
}

export function listUsageIcons(): readonly IconMappingEntry[] {
  return iconMappings;
}
