import type {Object3D} from 'three';

export function wallClockAngles(date:Date){
 const seconds=date.getSeconds(),minutes=date.getMinutes()+seconds/60,hours=date.getHours()%12+minutes/60;
 return {hour:-hours*Math.PI/6,minute:-minutes*Math.PI/30,second:-seconds*Math.PI/30};
}
/** Hands pivot around the real central hub. Uses device time, offline. */
export function updateWallClockHands(root:Object3D,date=new Date()):void {
 const angles=wallClockAngles(date);
 root.traverse(part=>{const hand=part.userData.clockHand as keyof typeof angles|undefined;if(hand&&hand in angles)part.rotation.z=angles[hand];});
}
