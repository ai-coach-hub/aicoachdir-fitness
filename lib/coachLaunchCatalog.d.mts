export type CoachCatalogEntry = Readonly<{
 slug:string;title:string;description:string;image:string;imageAlt:string;
 href:string|null;toolHref:string|null;toolLabel:string|null;toolDescription:string|null;
 availability:"member"|"unreleased";releaseGate:"existing"|"life-existing"|"never";
 history:string;metering:string;
}>;
export const COACH_CATALOG:readonly CoachCatalogEntry[];
export function catalogValid(catalog?:readonly CoachCatalogEntry[]):boolean;
export function visibleMemberCoaches(options?:{lifeAvailable?:boolean}):CoachCatalogEntry[];
export function availableCoachBySlug(slug:string, options?:{lifeAvailable?:boolean}):CoachCatalogEntry|null;
