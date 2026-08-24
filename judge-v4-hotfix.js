'use strict';

/* ShakeOnIt Judge v4 runtime hotfix
   Keeps Judge v3's instant deterministic referee, but replaces the model loader
   with a safer WASM/default-dtype path. The judge never depends on this loader
   to return a result because Judge v3 already has a hard timeout + safe fallback.
*/
(() => {
  const IMPORT_URL='https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0';
  const MODEL='Xenova/mobilebert-uncased-mnli';
  let hotfixClassifier=null;
  let hotfixLoading=null;

  loadJudgeV3Classifier = async function loadJudgeV4Classifier(){
    if(hotfixClassifier) return hotfixClassifier;
    if(hotfixLoading) return hotfixLoading;

    hotfixLoading=(async()=>{
      updateAiJudgeStatus('Loading reliable Hugging Face referee…');
      const {pipeline,env}=await import(IMPORT_URL);
      if(env){
        env.allowLocalModels=false;
        env.useBrowserCache=true;
        if(env.backends?.onnx?.wasm) env.backends.onnx.wasm.numThreads=1;
      }
      const pipe=await pipeline('zero-shot-classification',MODEL,{
        progress_callback: info=>{
          const pct=typeof progressPercent==='function'?progressPercent(info):null;
          const file=info?.file?String(info.file).split('/').pop():'';
          updateAiJudgeStatus(file?`Loading referee: ${file}`:'Loading reliable Hugging Face referee…',pct);
        }
      });
      hotfixClassifier=pipe;
      if(typeof judgeV3Classifier!=='undefined') judgeV3Classifier=pipe;
      return pipe;
    })().catch(error=>{
      hotfixLoading=null;
      hotfixClassifier=null;
      console.warn('Judge v4 model loader unavailable; instant referee remains active.',error);
      throw error;
    });

    return hotfixLoading;
  };

  if(typeof aiJudgeModelLabel==='function') aiJudgeModelLabel=()=> 'MobileBERT AI + instant referee v4';
})();
