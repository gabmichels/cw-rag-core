export type UserId = string;
export type GroupId = string;
export type LanguageCode = string;
export interface GroupHierarchy {
    [groupId: string]: {
        level: number;
        inherits?: GroupId[];
    };
}
export interface UserContext {
    id: UserId;
    groupIds: GroupId[];
    tenantId: string;
    language?: LanguageCode;
    groupHierarchy?: GroupHierarchy;
}
