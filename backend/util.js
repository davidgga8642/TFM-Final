export function toIsoDate(d=new Date()){ return d.toISOString().slice(0,10) }
export function toIsoTime(d=new Date()){ return d.toISOString() }
export function haversineMeters(lat1, lon1, lat2, lon2){
  function toRad(v){ return v * Math.PI / 180 }
  const R=6371000, dLat=toRad(lat2-lat1), dLon=toRad(lon2-lon1)
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  return R*c
}
export function hoursBetween(isoStart, isoEnd){
  const s=new Date(isoStart).getTime(), e=new Date(isoEnd).getTime()
  if(!s||!e) return 0
  return (e-s)/36e5
}
