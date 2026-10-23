// A server refresh must never silently rebase an older local draft.
export function mergeDraftVersion(draft,me,{owned=false}={}){
 if(!me)return draft;
 return {...draft,version:owned||!Number.isInteger(draft.version)?me.version:draft.version};
}
export function draftConflict(draft,me){return !!me&&Number.isInteger(draft?.version)&&draft.version!==me.version;}

// Title-search consent does not grant permission to request recommendations.
export function replacementBaseline(me,version,work){return {version,works:[work],initial:me.baseline.initial,externalConsent:me.externalConsent===true};}
