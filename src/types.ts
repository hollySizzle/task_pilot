/**
 * TaskPilot Type Definitions
 */

/**
 * Action types supported by TaskPilot
 */
export type ActionType = 'terminal' | 'vscodeCommand' | 'task';

/**
 * Command definition for reusable actions
 */
export interface CommandDefinition {
    /** Action type */
    type: ActionType;
    /** Command to execute */
    command: string;
    /** Terminal name (for type: terminal) */
    terminal?: string;
    /** Command arguments (for type: vscodeCommand) */
    args?: unknown[];
    /** Working directory (for type: terminal) */
    cwd?: string;
    /** Command description */
    description?: string;
}

/**
 * Action definition for multiple actions
 */
export interface ActionDefinition {
    /** Reference to a command defined in commands section */
    ref?: string;
    /** Action type (when not using ref) */
    type?: ActionType;
    /** Command to execute (when not using ref) */
    command?: string;
    /** Terminal name (when type is terminal and not using ref) */
    terminal?: string;
    /** Command arguments (when type is vscodeCommand and not using ref) */
    args?: unknown[];
    /** Working directory (when type is terminal and not using ref) */
    cwd?: string;
    /** Description for this action */
    description?: string;
}

/**
 * Menu item definition (recursive structure)
 */
export interface MenuItem {
    /** Display label (required) */
    label: string;
    /** Icon (emoji or codicon) */
    icon?: string;
    /** Description text */
    description?: string;
    /** Sub-menu items (makes this a category) */
    children?: MenuItem[];

    // Action definition (one of the following when no children)
    /** Reference to a command defined in commands section */
    ref?: string;
    /** Action type (when not using ref) */
    type?: ActionType;
    /** Command to execute (when not using ref) */
    command?: string;
    /** Terminal name (when type is terminal and not using ref) */
    terminal?: string;
    /** Command arguments (when type is vscodeCommand and not using ref) */
    args?: unknown[];
    /** Working directory (when type is terminal and not using ref) */
    cwd?: string;

    // Multiple actions
    /** Array of actions to execute sequentially */
    actions?: ActionDefinition[];
    /** Continue executing remaining actions even if one fails */
    continueOnError?: boolean;
}

/**
 * Root configuration structure for YAML file
 */
export interface MenuConfig {
    /** Configuration version */
    version: string;
    /** Reusable command definitions */
    commands?: Record<string, CommandDefinition>;
    /** Menu structure */
    menu: MenuItem[];
}

/**
 * Resolved action after ref lookup
 */
export interface ResolvedAction {
    /** Action type */
    type: ActionType;
    /** Command to execute */
    command: string;
    /** Terminal name (for terminal actions) */
    terminal?: string;
    /** Command arguments (for vscodeCommand actions) */
    args?: unknown[];
    /** Working directory (for terminal actions) */
    cwd?: string;
    /** Description */
    description?: string;
}

/**
 * Quick Pick item for VS Code UI
 */
export interface TaskPickItem {
    /** Display label */
    label: string;
    /** Description shown next to label */
    description?: string;
    /** Detail shown below label */
    detail?: string;
    /** Original menu item */
    menuItem: MenuItem;
    /** Whether this is a back button */
    isBack?: boolean;
}

/**
 * Validation error information
 */
export interface ValidationError {
    /** Error message */
    message: string;
    /** Path to the problematic field (e.g., "menu[0].children[1].ref") */
    path?: string;
}

/**
 * Validation result
 */
export interface ValidationResult {
    /** Whether the configuration is valid */
    valid: boolean;
    /** List of errors (empty if valid) */
    errors: ValidationError[];
}

/**
 * Options for multiple action execution
 */
export interface MultipleActionOptions {
    /** Continue executing remaining actions even if one fails */
    continueOnError?: boolean;
    /** Cancellation token to abort execution */
    cancellationToken?: { isCancellationRequested: boolean };
    /** Progress callback called after each action completes */
    onProgress?: (current: number, total: number, action: ResolvedAction) => void;
}

/**
 * Error info for multiple action execution
 */
export interface ActionError {
    /** Index of the failed action */
    index: number;
    /** The action that failed */
    action: ResolvedAction;
    /** The error that occurred */
    error: Error;
}

/**
 * Result of multiple action execution
 */
export interface MultipleActionResult {
    /** Whether all actions completed successfully */
    success: boolean;
    /** Number of successfully completed actions */
    completedCount: number;
    /** Total number of actions */
    totalCount: number;
    /** Whether execution was cancelled */
    cancelled?: boolean;
    /** Error that caused execution to stop (when continueOnError is false) */
    error?: Error;
    /** Index of failed action (when continueOnError is false) */
    failedIndex?: number;
    /** List of errors (when continueOnError is true) */
    errors?: ActionError[];
}
