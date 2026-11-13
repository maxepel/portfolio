// Coordinates are in page space. Move only upward until every demo is clear.
export function liftBubbleAboveDemos({left,top,width,height}, demos, gap=24){
  let y=top;
  for(let pass=0;pass<demos.length;pass++){
    let next=y;
    for(const demo of demos){
      if(left+width+gap<=demo.left||left-gap>=demo.right) continue;
      if(y+height+gap>demo.top&&y-gap<demo.bottom){
        next=Math.min(next,demo.top-height-gap);
      }
    }
    if(next===y) break;
    y=next;
  }
  return y;
}
