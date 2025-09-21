export type UserId = string;
export type GroupId = string;
export interface UserContext {
    id: UserId;
    groupIds: GroupId[];
    tenantId: string;
}
