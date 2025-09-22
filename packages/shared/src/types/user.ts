export type UserId = string;
export type GroupId = string;
export type LanguageCode = string; // ISO 639-1 language codes (e.g., 'en', 'es', 'fr')

export interface GroupHierarchy {
  [groupId: string]: {
    level: number; // Higher number = higher privilege (e.g., admin=3, editor=2, viewer=1)
    inherits?: GroupId[]; // Groups this group inherits permissions from
  };
}

export interface UserContext {
  id: UserId;
  groupIds: GroupId[];
  tenantId: string;
  language?: LanguageCode; // User's preferred language for content relevance
  groupHierarchy?: GroupHierarchy; // Group hierarchy information for enhanced RBAC
}
