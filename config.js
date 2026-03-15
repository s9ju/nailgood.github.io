/**
 * CONFIG - OPTIMIZED
 */
const CONFIG={DATA_FILE:'data.json',DEBUG:!0,DEFAULTS:{PRIMARY_COLOR:'#ff69b4',SLOT_STEP:30}};
const FALLBACK_DATA={settings:{masterName:"Анна Иванова",masterDescription:"Топ-мастер с опытом 5 лет",masterPhoto:"https://images.unsplash.com/photo-1580618672591-eb180b1a973f?w=200",primaryColor:"#ff69b4",backgroundImage:"",confirmationText:"Мастер перезвонит вам за сутки до записи",botToken:"",masterChatId:"",channelUsername:""},services:[{name:"Маникюр базовый",price:1500,duration:60},{name:"Маникюр + покрытие",price:2500,duration:90},{name:"Маникюр + дизайн",price:3000,duration:120},{name:"Снятие покрытия",price:500,duration:30},{name:"Педикюр полный",price:3500,duration:150}],schedule:[{date:"2026-03-13",startTime:"09:00",endTime:"20:00",breakStart:"13:00",breakEnd:"14:00"},{date:"2026-03-14",startTime:"10:00",endTime:"18:00",breakStart:"",breakEnd:""},{date:"2026-03-15",startTime:"",endTime:"",breakStart:"",breakEnd:""},{date:"2026-03-16",startTime:"09:00",endTime:"20:00",breakStart:"13:00",breakEnd:"14:00"},{date:"2026-03-17",startTime:"09:00",endTime:"20:00",breakStart:"13:00",breakEnd:"14:00"},{date:"2026-03-18",startTime:"10:00",endTime:"18:00",breakStart:"",breakEnd:""},{date:"2026-03-19",startTime:"09:00",endTime:"20:00",breakStart:"13:00",breakEnd:"14:00"},{date:"2026-03-20",startTime:"09:00",endTime:"20:00",breakStart:"13:00",breakEnd:"14:00"},{date:"2026-03-21",startTime:"10:00",endTime:"16:00",breakStart:"",breakEnd:""},{date:"2026-03-22",startTime:"",endTime:"",breakStart:"",breakEnd:""},{date:"2026-03-23",startTime:"09:00",endTime:"20:00",breakStart:"13:00",breakEnd:"14:00"},{date:"2026-03-24",startTime:"09:00",endTime:"20:00",breakStart:"13:00",breakEnd:"14:00"},{date:"2026-03-25",startTime:"10:00",endTime:"18:00",breakStart:"",breakEnd:""},{date:"2026-03-26",startTime:"09:00",endTime:"20:00",breakStart:"13:00",breakEnd:"14:00"},{date:"2026-03-27",startTime:"09:00",endTime:"20:00",breakStart:"13:00",breakEnd:"14:00"},{date:"2026-03-28",startTime:"10:00",endTime:"16:00",breakStart:"",breakEnd:""},{date:"2026-03-29",startTime:"",endTime:"",breakStart:"",breakEnd:""},{date:"2026-03-30",startTime:"09:00",endTime:"20:00",breakStart:"13:00",breakEnd:"14:00"},{date:"2026-03-31",startTime:"09:00",endTime:"20:00",breakStart:"13:00",breakEnd:"14:00"}],adminPassword:"NailPro2024!"};
async function loadData(){
try{
console.log('[CONFIG] Загрузка data.json...');
const r=await fetch(CONFIG.DATA_FILE,{method:'GET',headers:{'Content-Type':'application/json'},cache:'no-cache'});
console.log('[CONFIG] Status:',r.status,r.statusText);
if(!r.ok){const err=new Error('HTTP '+r.status);err.status=r.status;throw err}
const data=await r.json();
console.log('[CONFIG] ✅ data.json загружен успешно');
return data
}catch(e){
console.error('[CONFIG] ❌ Ошибка загрузки data.json:',e.message);
console.log('[CONFIG] Используем fallback данные');
return FALLBACK_DATA
}}
const debugLog=(m,d)=>{CONFIG.DEBUG&&console.log(`[DEBUG] ${m}`,d||'')};
