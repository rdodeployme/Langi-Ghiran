// LG Recycling — site behaviour
(function () {
  // Mobile menu
  var toggle = document.querySelector('.menu-toggle');
  var nav = document.querySelector('.nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    nav.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        nav.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // Footer year
  var y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();

  function setStatus(el, msg, kind) {
    if (!el) return;
    el.textContent = msg;
    el.className = 'form-status' + (kind ? ' ' + kind : '');
  }

  function firstInvalid(form) {
    var bad = null;
    form.querySelectorAll('.field-error').forEach(function (n) { n.classList.remove('field-error'); });
    form.querySelectorAll('[required]').forEach(function (el) {
      if (el.type === 'radio') {
        var group = form.querySelectorAll('input[name="' + el.name + '"]');
        var any = Array.prototype.some.call(group, function (r) { return r.checked; });
        if (!any) {
          var row = el.closest('.yn');
          if (row) row.classList.add('field-error');
          bad = bad || el;
        }
      } else if (!el.checkValidity()) {
        el.classList.add('field-error');
        bad = bad || el;
      }
    });
    return bad;
  }

  // Post a form to its PHP handler and read the JSON reply ({ ok, reference, error })
  function postForm(url, body) {
    return fetch(url, { method: 'POST', body: body, headers: { 'Accept': 'application/json' } })
      .then(function (res) {
        return res.json().then(function (data) { return { status: res.status, data: data }; },
          function () { return { status: res.status, data: { ok: false, error: 'Unexpected server response' } }; });
      })
      .then(function (r) {
        if (!r.data || !r.data.ok) throw new Error((r.data && r.data.error) || ('HTTP ' + r.status));
        return r.data;
      });
  }

  // Enquiry form
  var enquiry = document.getElementById('enquiry-form');
  if (enquiry) {
    enquiry.addEventListener('submit', function (e) {
      e.preventDefault();
      var status = enquiry.querySelector('.form-status');
      var bad = firstInvalid(enquiry);
      if (bad) { setStatus(status, 'Please complete the required fields.', 'err'); bad.focus(); return; }
      var btn = enquiry.querySelector('button[type=submit]');
      btn.disabled = true;
      setStatus(status, 'Sending…');
      postForm(enquiry.action, new FormData(enquiry))
        .then(function (data) {
          enquiry.hidden = true;
          var ref = document.getElementById('enquiry-ref');
          if (ref && data.reference) ref.textContent = 'Reference: ' + data.reference;
          document.getElementById('enquiry-success').classList.add('show');
        })
        .catch(function () {
          btn.disabled = false;
          setStatus(status, 'Something went wrong sending your enquiry. Please try again, or call us.', 'err');
        });
    });
  }

  // Soil declaration form (multipart; signature sent as a PNG data URL in sig_image)
  var decl = document.getElementById('declaration-form');
  if (decl) {
    var canvas = document.getElementById('sig-canvas');
    var pad = null;
    function sizeCanvas() {
      var ratio = Math.max(window.devicePixelRatio || 1, 1);
      var data = pad && !pad.isEmpty() ? pad.toData() : null;
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext('2d').scale(ratio, ratio);
      if (pad) { pad.clear(); if (data) pad.fromData(data); }
    }
    if (window.SignaturePad && canvas) {
      pad = new window.SignaturePad(canvas, { penColor: '#1D1F1C', backgroundColor: 'rgb(255,255,255)' });
      sizeCanvas();
      window.addEventListener('resize', sizeCanvas);
      pad.addEventListener('beginStroke', function () {
        var h = document.querySelector('.sig-hint');
        if (h) h.style.display = 'none';
      });
      document.getElementById('sig-clear').addEventListener('click', function () {
        pad.clear();
        var h = document.querySelector('.sig-hint');
        if (h) h.style.display = '';
      });
    }

    // Default today's date on the signature date
    var sigDate = decl.querySelector('input[name="signature_date"]');
    if (sigDate && !sigDate.value) sigDate.value = new Date().toISOString().slice(0, 10);

    decl.addEventListener('submit', function (e) {
      e.preventDefault();
      var status = decl.querySelector('.form-status');
      var bad = firstInvalid(decl);
      var materials = decl.querySelectorAll('input[name="material_type"]:checked');
      if (!materials.length) {
        decl.querySelector('.material-group').classList.add('field-error');
        bad = bad || decl.querySelector('input[name="material_type"]');
      }
      if (!pad || pad.isEmpty()) {
        document.querySelector('.sig-wrap').classList.add('field-error');
        bad = bad || canvas;
      }
      if (bad) {
        setStatus(status, 'Please complete all required fields and sign the declaration.', 'err');
        if (bad.scrollIntoView) bad.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      // Priority-waste answers that the site cannot accept
      var blocked = ['contains_rpw', 'contains_asbestos', 'contains_wass'].filter(function (n) {
        var r = decl.querySelector('input[name="' + n + '"]:checked');
        return r && r.value === 'Yes';
      });
      if (blocked.length) {
        setStatus(status, 'We can’t accept material containing asbestos, reportable priority waste or waste acid sulfate soil. Please contact us before going any further.', 'err');
        return;
      }

      var btn = decl.querySelector('button[type=submit]');
      btn.disabled = true;
      setStatus(status, 'Submitting declaration…');

      var fd = new FormData(decl);
      fd.delete('material_type');
      fd.append('material_type', Array.prototype.map.call(materials, function (m) { return m.value; }).join(', '));
      fd.set('sig_image', canvas.toDataURL('image/png'));

      postForm(decl.action, fd)
        .then(function (data) {
          var ref = document.getElementById('declaration-ref');
          if (ref && data.reference) ref.textContent = 'Reference: ' + data.reference;
          decl.classList.add('submitted');
          decl.querySelectorAll('input,select,textarea').forEach(function (el) { el.setAttribute('disabled', ''); });
          decl.querySelector('.form-actions').hidden = true;
          document.getElementById('declaration-success').classList.add('show');
          document.getElementById('declaration-success').scrollIntoView({ behavior: 'smooth', block: 'center' });
        })
        .catch(function () {
          btn.disabled = false;
          setStatus(status, 'Something went wrong submitting the declaration. Please try again, or contact us.', 'err');
        });
    });

    var printBtn = document.getElementById('print-copy');
    if (printBtn) printBtn.addEventListener('click', function () { window.print(); });
  }
})();
