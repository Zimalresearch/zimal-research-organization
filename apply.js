(() => {
  const form=document.querySelector('#applicationForm');
  const msg=document.querySelector('#applicationMessage');
  const btn=document.querySelector('#submitApplication');
  const cfg=window.ZRO_CONFIG||{};
  const ready=cfg.SUPABASE_URL&&cfg.SUPABASE_ANON_KEY&&!cfg.SUPABASE_URL.includes('YOUR_')&&!cfg.SUPABASE_ANON_KEY.includes('YOUR_');
  const say=(t,bad=false)=>{msg.textContent=t;msg.className='form-message '+(bad?'error':'success');};
  if(!ready||!window.supabase){form.addEventListener('submit',e=>e.preventDefault());say('Applications are temporarily unavailable. The ZRO administrator must check the secure database connection.',true);btn.disabled=true;return;}
  const db=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
  form.addEventListener('submit',async e=>{
    e.preventDefault();
    if(!form.reportValidity())return;
    if(!form.elements.adult_confirm.checked){say('Applicants must be 18 or older.',true);return;}
    btn.disabled=true;say('Submitting your application securely…');
    let cvPath=null;
    try{
      const f=form.elements,cv=f.cv_file.files[0],allowed=['application/pdf','image/jpeg','image/png'];
      if(cv&&(!allowed.includes(cv.type)||cv.size>5*1024*1024))throw new Error('CV must be PDF, JPG or PNG and no larger than 5 MB.');
      const id=crypto.randomUUID();
      if(cv){
        const ext=cv.name.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g,'');
        cvPath=`${id}/cv.${ext}`;
        const {error}=await db.storage.from('zro-private-applications').upload(cvPath,cv,{upsert:false,contentType:cv.type});
        if(error)throw error;
      }
      const payload={id,full_name:f.full_name.value.trim(),father_name:f.father_name.value.trim(),email:f.email.value.trim(),phone:f.phone.value.trim(),city:f.city.value.trim(),address:f.address.value.trim(),cnic:f.cnic.value.trim(),application_type:f.application_type.value,department:f.department.value,education:f.education.value.trim(),experience:f.experience.value.trim(),motivation:f.motivation.value.trim(),availability:f.availability.value.trim(),police_file_path:'',cv_file_path:cvPath,status:'pending'};
      const {error}=await db.from('zro_applications').insert(payload);
      if(error)throw error;
      form.reset();say('Your application has been submitted successfully and is pending review. ZRO will contact you using the details provided.');
    }catch(err){
      if(cvPath)await db.storage.from('zro-private-applications').remove([cvPath]);
      say(err.message||'Could not submit the application. Please try again later.',true);
    }finally{btn.disabled=false;}
  });
})();
