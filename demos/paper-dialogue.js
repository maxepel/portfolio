// Keep descriptions and jokes separate; split long speeches near sentence ends.
export function tourSpeechPages(text, joke = null, limit = 32) {
  function split(source, kind) {
    const words=source.trim().split(/\s+/).filter(Boolean),pages=[];
    while(words.length>limit) {
      let end=Math.min(limit,words.length-4);
      for(let i=end;i>=Math.ceil(limit*.55);i--) {
        if(/[.!?][”’"']?$/.test(words[i-1])){end=i;break;}
      }
      pages.push({text:words.splice(0,end).join(' '),kind});
    }
    if(words.length)pages.push({text:words.join(' '),kind});
    return pages;
  }
  const pages=split(text,'speech');
  if(joke)pages.push(...split(joke,'joke'));
  return pages.length?pages:[{text:'',kind:'speech'}];
}
