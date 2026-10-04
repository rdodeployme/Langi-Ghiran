// LG Recycling — site behaviour (v2)
(function () {
  'use strict';
  var doc = document;
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function $(sel, root) { return (root || doc).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || doc).querySelectorAll(sel)); }
  function store(key, val) {
    try {
      if (val === undefined) return JSON.parse(window.localStorage.getItem(key) || 'null');
      if (val === null) window.localStorage.removeItem(key); else window.localStorage.setItem(key, JSON.stringify(val));
    } catch (e) { return null; }
  }

  /* ---------- Header: scrolled state + mobile menu ---------- */
  var header = $('.site-header');
  var toggle = $('.menu-toggle');
  function onScroll() { if (header) header.classList.toggle('scrolled', window.scrollY > 24); }
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
  if (toggle && header) {
    toggle.addEventListener('click', function () {
      var open = header.classList.toggle('menu-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    $$('.nav a').forEach(function (a) {
      a.addEventListener('click', function () {
        header.classList.remove('menu-open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && header.classList.contains('menu-open')) {
        header.classList.remove('menu-open'); toggle.setAttribute('aria-expanded', 'false'); toggle.focus();
      }
    });
  }

  var y = $('#year');
  if (y) y.textContent = new Date().getFullYear();

  /* ---------- Sentence line-breaking ----------
     Multi-sentence headings wrap each sentence in .sen so a new sentence moves to the
     next line whole. Where a sentence fits on one line it is locked to one line
     (.sen-fit, white-space:nowrap); otherwise it wraps (balanced). Measured, not guessed,
     so no browser can drop the last word of a sentence that fits by a fraction of a pixel. */
  var sens = $$('.sen');
  function blockParent(el) {
    var p = el.parentElement;
    while (p && /^inline/.test(window.getComputedStyle(p).display)) p = p.parentElement;
    return p;
  }
  function fitSentences() {
    if (!sens.length) return;
    // 1. Room available, read with nothing locked (a locked line can widen a grid cell).
    sens.forEach(function (s) { s.classList.remove('sen-fit'); });
    var avail = sens.map(function (s) {
      var p = blockParent(s); if (!p) return 0;
      var cs = window.getComputedStyle(p);
      return p.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    });
    // 2. Each sentence's one-line width.
    sens.forEach(function (s) { s.classList.add('sen-measure'); });
    var need = sens.map(function (s) { return s.getBoundingClientRect().width; });
    // 3. Lock only the ones that fit, with 2px to spare.
    sens.forEach(function (s, i) { s.classList.remove('sen-measure'); if (need[i] + 2 <= avail[i]) s.classList.add('sen-fit'); });
  }
  if (sens.length) {
    fitSentences();
    var fitRaf = 0, lastW = window.innerWidth;
    window.addEventListener('resize', function () {
      if (window.innerWidth === lastW) return; lastW = window.innerWidth;
      cancelAnimationFrame(fitRaf); fitRaf = requestAnimationFrame(fitSentences);
    });
    if (doc.fonts) {
      if (doc.fonts.ready) doc.fonts.ready.then(fitSentences);
      if (doc.fonts.addEventListener) doc.fonts.addEventListener('loadingdone', fitSentences);
    }
    window.addEventListener('load', fitSentences);
  }

  /* ---------- Reveal on scroll ---------- */
  var reveals = $$('.reveal');
  if ('IntersectionObserver' in window && !reduceMotion) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('in'); });
  }

  /* ---------- Hero video (desktop, motion allowed, not on data saver) ---------- */
  var vid = $('[data-hero-video]');
  if (vid) {
    var conn = navigator.connection || {};
    var wide = window.matchMedia('(min-width: 768px)').matches;
    if (wide && !reduceMotion && !conn.saveData) {
      vid.src = vid.getAttribute('data-src');
      vid.addEventListener('playing', function () { vid.classList.add('playing'); });
      vid.addEventListener('error', function () { vid.remove(); });
      var p = vid.play();
      if (p && p.catch) p.catch(function () { /* autoplay blocked: poster image stays */ });
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (en) {
          if (en[0].isIntersecting) { var q = vid.play(); if (q && q.catch) q.catch(function () {}); } else vid.pause();
        }).observe(vid);
      }
    } else {
      vid.remove();
    }
  }

  /* ---------- Before / after slider ---------- */
  $$('[data-compare]').forEach(function (box) {
    var range = $('input[type=range]', box);
    function set(v) { box.style.setProperty('--pos', v + '%'); }
    range.addEventListener('input', function () { set(range.value); });
    set(range.value);
  });

  /* ---------- Soil checker ---------- */
  var HAZ = { contains_asbestos: 'asbestos', contains_rpw: 'reportable priority waste', contains_wass: 'waste acid sulfate soil' };
  $$('[data-checker]').forEach(function (ck) {
    var steps = $$('.checker-step', ck);
    var bars = $$('.checker-progress i', ck);
    var label = $('[data-step-label]', ck);
    var current = 1;
    function show(n) {
      current = n;
      steps.forEach(function (s) { s.classList.toggle('active', +s.getAttribute('data-step') === n); });
      bars.forEach(function (b, i) { b.classList.toggle('on', i < n); });
      if (label) label.textContent = n === 3 ? 'Your result' : 'Step ' + n + ' of 3';
      var h = $('.checker-step.active h3', ck);
      if (h && ck.getBoundingClientRect().top < 0) ck.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    }
    function materials() { return $$('input[name=ck_material]:checked', ck).map(function (i) { return i.value; }); }
    function answer(name) { var r = $('input[name=' + name + ']:checked', ck); return r ? r.value : null; }
    function err(stepEl, msg) { var e = $('[data-err]', stepEl); if (e) e.textContent = msg || ''; }

    function result() {
      var mats = materials();
      var soils = mats.filter(function (m) { return m !== 'other'; });
      var other = mats.indexOf('other') !== -1;
      var hazYes = Object.keys(HAZ).filter(function (k) { return answer(k) === 'Yes'; });
      var hazUnsure = Object.keys(HAZ).filter(function (k) { return answer(k) === 'Not sure'; });
      var cont = answer('signs_of_contamination');
      var demo = answer('demolition_on_site');
      var params = new URLSearchParams();
      if (soils.length) params.set('m', soils.join('|'));
      ['contains_asbestos', 'contains_rpw', 'contains_wass', 'signs_of_contamination', 'demolition_on_site'].forEach(function (k) {
        var v = answer(k); if (v === 'Yes' || v === 'No') params.set(k, v);
      });
      var declUrl = 'soil-declaration.html?' + params.toString();

      if (!soils.length) {
        return { kind: 'no', badge: 'Not a match', title: "That's not something we take.",
          body: '<p>LG Recycling accepts soil only. General rubbish, green waste, concrete and demolition waste need to go to a facility licensed for that material.</p><p><span class="tbc">Nearby alternatives TBC</span></p>',
          actions: '<a class="btn btn-ghost" href="index.html#enquire">Ask us anyway</a>' };
      }
      if (hazYes.length) {
        return { kind: 'no', badge: "Can't accept", title: "We can't accept this material.",
          body: '<p>LG Recycling can\'t accept material containing ' + hazYes.map(function (k) { return HAZ[k]; }).join(', ') + '. It needs to go to a facility licensed to receive it.</p>',
          actions: '<a class="btn btn-ghost" href="index.html#enquire">Talk to us</a>' };
      }
      var notes = [];
      if (hazUnsure.length) notes.push('You weren\'t sure about ' + hazUnsure.map(function (k) { return HAZ[k]; }).join(', ') + '. We\'ll need that confirmed, usually through a waste classification assessment.');
      if (cont === 'Yes' || cont === 'Not sure') notes.push('Material showing signs of contamination needs an assessment before we can consider it.');
      if (other) notes.push('We can only take the soil. Anything else in the load needs to be separated and go elsewhere.');
      if (notes.length) {
        return { kind: 'maybe', badge: 'Talk to us first', title: 'Possibly. We need a bit more information.',
          body: '<ul>' + notes.map(function (n) { return '<li>' + n + '</li>'; }).join('') + '</ul><p>Send us the details and we\'ll tell you what\'s needed.</p>',
          actions: '<a class="btn btn-primary" href="index.html#enquire">Send an enquiry <span class="arrow" aria-hidden="true">&rarr;</span></a><a class="btn btn-ghost" href="' + declUrl + '">Start a declaration</a>' };
      }
      var extra = (demo === 'Yes' || demo === 'Not sure') ? '<p>Demolition has taken place on the source site, so attach any waste classification assessment you have to your declaration.</p>' : '';
      return { kind: 'ok', badge: 'Looks like a fit', title: 'Your soil looks suitable.',
        body: '<p>Based on your answers, <strong>' + soils.join(', ').toLowerCase() + '</strong> is the kind of material we accept. Next, complete a soil declaration. We\'ve pre-filled what you told us.</p>' + extra,
        actions: '<a class="btn btn-primary" href="' + declUrl + '">Continue to declaration <span class="arrow" aria-hidden="true">&rarr;</span></a>' };
    }

    ck.addEventListener('click', function (e) {
      var t = e.target.closest('button');
      if (!t || !ck.contains(t)) return;
      var stepEl = t.closest('.checker-step');
      if (t.hasAttribute('data-next')) {
        if (current === 1) {
          if (!materials().length) { err(stepEl, 'Select at least one.'); return; }
          err(stepEl, '');
          if (materials().length === 1 && materials()[0] === 'other') { render(); show(3); return; }
          show(2);
        } else if (current === 2) {
          var missing = ['contains_asbestos', 'contains_rpw', 'contains_wass', 'signs_of_contamination', 'demolition_on_site'].filter(function (k) { return !answer(k); });
          if (missing.length) { err(stepEl, 'Please answer every question.'); return; }
          err(stepEl, '');
          render(); show(3);
        }
      } else if (t.hasAttribute('data-back')) {
        show(current - 1);
      } else if (t.hasAttribute('data-restart')) {
        $$('input', ck).forEach(function (i) { i.checked = false; });
        show(1);
      }
    });
    function render() {
      var r = result();
      $('[data-result]', ck).innerHTML = '<div class="result ' + r.kind + '"><span class="badge">' + r.badge + '</span><h3>' + r.title + '</h3>' + r.body + '</div><div class="actions">' + r.actions + '</div>';
    }
  });

  /* ---------- Form helpers ---------- */
  function setStatus(el, msg, kind) {
    if (!el) return;
    el.textContent = msg;
    el.className = 'form-status' + (kind ? ' ' + kind : '');
  }
  function firstInvalid(scope) {
    var bad = null;
    $$('.field-error', scope).forEach(function (n) { n.classList.remove('field-error'); });
    $$('[required]', scope).forEach(function (el) {
      if (el.disabled) return;
      if (el.type === 'radio') {
        var group = $$('input[name="' + el.name + '"]', scope);
        if (!group.some(function (r) { return r.checked; })) {
          var row = el.closest('.yn'); if (row) row.classList.add('field-error');
          bad = bad || el;
        }
      } else if (el.type === 'checkbox') {
        if (!el.checked) { (el.closest('.confirm') || el).classList.add('field-error'); bad = bad || el; }
      } else if (!el.checkValidity()) {
        el.classList.add('field-error');
        bad = bad || el;
      }
    });
    return bad;
  }
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

  /* ---------- Enquiry form ---------- */
  var enquiry = $('#enquiry-form');
  if (enquiry) {
    enquiry.addEventListener('submit', function (e) {
      e.preventDefault();
      var status = $('.form-status', enquiry);
      var bad = firstInvalid(enquiry);
      if (bad) { setStatus(status, 'Please complete the required fields.', 'err'); bad.focus(); return; }
      var btn = $('button[type=submit]', enquiry);
      btn.disabled = true;
      setStatus(status, 'Sending…');
      postForm(enquiry.action, new FormData(enquiry))
        .then(function (data) {
          enquiry.hidden = true;
          var ref = $('#enquiry-ref');
          if (ref && data.reference) ref.textContent = 'Reference: ' + data.reference;
          $('#enquiry-success').classList.add('show');
        })
        .catch(function () {
          btn.disabled = false;
          setStatus(status, 'Something went wrong sending your enquiry. Please try again, or call us.', 'err');
        });
    });
  }

  /* ---------- Soil declaration wizard ---------- */
  var decl = $('#declaration-form');
  if (decl) {
    var DRAFT = 'lg-declaration-draft-v1';
    var sections = $$('.form-section', decl);
    var bar = $('#steps-bar');
    var btnBack = $('[data-wiz-back]', decl);
    var btnNext = $('[data-wiz-next]', decl);
    var btnSubmit = $('[data-wiz-submit]', decl);
    var statusEl = $('.wiz-nav .form-status', decl);
    var canvas = $('#sig-canvas');
    var pad = null;
    var step = 0;
    var reached = 0;

    // Steps bar
    sections.forEach(function (s, i) {
      var li = doc.createElement('li');
      var b = doc.createElement('button');
      b.type = 'button';
      b.textContent = s.getAttribute('data-title');
      b.addEventListener('click', function () { if (i <= reached) go(i); });
      li.appendChild(b);
      bar.appendChild(li);
    });

    function sizeCanvas() {
      if (!canvas || !canvas.offsetWidth) return;
      var ratio = Math.max(window.devicePixelRatio || 1, 1);
      var data = pad && !pad.isEmpty() ? pad.toData() : null;
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext('2d').scale(ratio, ratio);
      if (pad) { pad.clear(); if (data) pad.fromData(data); }
    }
    if (window.SignaturePad && canvas) {
      pad = new window.SignaturePad(canvas, { penColor: '#171E21', backgroundColor: 'rgb(255,255,255)' });
      window.addEventListener('resize', sizeCanvas);
      pad.addEventListener('beginStroke', function () { var h = $('.sig-hint'); if (h) h.style.display = 'none'; $('.sig-wrap').classList.remove('field-error'); });
      $('#sig-clear').addEventListener('click', function () { pad.clear(); var h = $('.sig-hint'); if (h) h.style.display = ''; });
    }

    function go(i) {
      step = i;
      reached = Math.max(reached, i);
      sections.forEach(function (s, k) { s.classList.toggle('active', k === i); });
      $$('li', bar).forEach(function (li, k) {
        li.classList.toggle('current', k === i);
        li.classList.toggle('done', k < i || (k <= reached && k !== i));
      });
      btnBack.hidden = i === 0;
      btnNext.hidden = i === sections.length - 1;
      btnSubmit.hidden = i !== sections.length - 1;
      setStatus(statusEl, '');
      if (sections[i].hasAttribute('data-sign')) setTimeout(sizeCanvas, 30);
      if (sections[i].hasAttribute('data-review')) buildReview();
      var top = $('.wizard-head');
      if (top) window.scrollTo({ top: window.scrollY + top.getBoundingClientRect().top - 90, behavior: reduceMotion ? 'auto' : 'smooth' });
    }

    function blockedAnswers() {
      return ['contains_rpw', 'contains_asbestos', 'contains_wass'].filter(function (n) {
        var r = $('input[name="' + n + '"]:checked', decl); return r && r.value === 'Yes';
      });
    }
    function refreshBlocked() {
      var b = blockedAnswers();
      $$('.yn', decl).forEach(function (row) {
        var r = $('input:checked', row);
        row.classList.toggle('blocked', !!(r && r.value === 'Yes' && $('small', row)));
      });
      var alert = $('#blocked-alert');
      if (alert) alert.classList.toggle('show', b.length > 0);
      return b.length;
    }

    function validateStep(i) {
      var s = sections[i];
      var bad = firstInvalid(s);
      var msg = 'Please complete the highlighted fields.';
      if (s.querySelector('.material-group')) {
        var group = $('.material-group .checks', s);
        group.classList.remove('field-error');
        if (!$$('input[name="material_type"]:checked', s).length) { group.classList.add('field-error'); bad = bad || $('input[name="material_type"]', s); }
      }
      if (s.querySelector('input[name="job_end"]')) {
        var a = $('input[name="job_start"]', s).value, b = $('input[name="job_end"]', s).value;
        if (a && b && b < a) { $('input[name="job_end"]', s).classList.add('field-error'); bad = bad || $('input[name="job_end"]', s); msg = 'The job end date can\'t be before the start date.'; }
      }
      if (s.querySelector('.yn') && refreshBlocked()) {
        setStatus(statusEl, 'We can\'t accept this material. See the note above.', 'err');
        return false;
      }
      if (s.hasAttribute('data-sign') && (!pad || pad.isEmpty())) {
        $('.sig-wrap').classList.add('field-error'); bad = bad || canvas;
      }
      if (bad) {
        setStatus(statusEl, msg, 'err');
        if (bad.scrollIntoView) bad.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
        if (bad.focus && bad !== canvas) setTimeout(function () { try { bad.focus({ preventScroll: true }); } catch (e) {} }, 300);
        return false;
      }
      return true;
    }

    btnNext.addEventListener('click', function () { if (validateStep(step)) { saveDraft(); go(step + 1); } });
    btnBack.addEventListener('click', function () { go(step - 1); });
    decl.addEventListener('change', function (e) { if (e.target.type === 'radio') refreshBlocked(); saveDraft(); });
    decl.addEventListener('input', debounce(saveDraft, 400));

    // Review
    function labelFor(el) {
      if (el.type === 'radio') { var row = el.closest('.yn'); return row ? $('.q', row).childNodes[0].textContent.trim() : el.name; }
      var l = el.id ? $('label[for="' + el.id + '"]', decl) : null;
      return l ? l.textContent.replace('*', '').trim() : el.name;
    }
    function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    function buildReview() {
      var out = $('#review');
      var html = '';
      sections.forEach(function (s, i) {
        if (s.hasAttribute('data-review')) return;
        var rows = [], seen = {};
        $$('input,select,textarea', s).forEach(function (el) {
          if (!el.name || el.type === 'hidden' || el.name === 'website' || seen[el.name]) return;
          var val = '';
          if (el.type === 'radio') { seen[el.name] = 1; var r = $('input[name="' + el.name + '"]:checked', s); val = r ? r.value : ''; }
          else if (el.type === 'checkbox' && el.name === 'material_type') { seen[el.name] = 1; val = $$('input[name="material_type"]:checked', s).map(function (c) { return c.value; }).join(', '); rows.push(['Material type', val]); return; }
          else if (el.type === 'checkbox') { val = el.checked ? 'Agreed' : 'Not agreed'; rows.push(['Declaration', val]); return; }
          else if (el.type === 'file') { val = el.files && el.files[0] ? el.files[0].name : 'None attached'; }
          else val = el.value;
          rows.push([labelFor(el), val || '—']);
        });
        var extra = '';
        if (s.hasAttribute('data-sign') && pad && !pad.isEmpty()) extra = '<dt>Signature</dt><dd><img src="' + canvas.toDataURL('image/png') + '" alt="Your signature" style="max-width:220px;background:#fff;border:1px solid #DCDAD2;border-radius:6px"></dd>';
        html += '<div class="review-block"><h4>' + esc(s.getAttribute('data-title')) + ' <button type="button" class="link-btn" data-edit="' + i + '">Edit</button></h4><dl>' +
          rows.map(function (r) { return '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>'; }).join('') + extra + '</dl></div>';
      });
      out.innerHTML = html;
    }
    $('#review').addEventListener('click', function (e) { var b = e.target.closest('[data-edit]'); if (b) go(+b.getAttribute('data-edit')); });

    // Draft save / restore (skip files and signature)
    function debounce(fn, ms) { var t; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; }
    function saveDraft() {
      if (decl.classList.contains('submitted')) return;
      var data = {};
      $$('input,select,textarea', decl).forEach(function (el) {
        if (!el.name || el.type === 'file' || el.type === 'hidden' || el.name === 'website') return;
        if (el.type === 'radio') { if (el.checked) data[el.name] = el.value; }
        else if (el.type === 'checkbox') { if (el.name === 'material_type') { data.material_type = data.material_type || []; if (el.checked) data.material_type.push(el.value); } else data[el.name] = el.checked; }
        else data[el.name] = el.value;
      });
      store(DRAFT, { t: Date.now(), d: data });
    }
    function apply(data) {
      Object.keys(data).forEach(function (name) {
        var v = data[name];
        if (name === 'material_type') { $$('input[name="material_type"]', decl).forEach(function (c) { c.checked = v.indexOf(c.value) !== -1; }); return; }
        var els = $$('[name="' + name + '"]', decl);
        els.forEach(function (el) {
          if (el.type === 'radio') el.checked = el.value === v;
          else if (el.type === 'checkbox') el.checked = !!v;
          else if (el.type !== 'file') el.value = v;
        });
      });
      refreshBlocked();
    }
    var qs = new URLSearchParams(window.location.search);
    var prefilled = false;
    if (qs.has('m') || qs.has('contains_asbestos')) {
      var pre = {};
      if (qs.get('m')) pre.material_type = qs.get('m').split('|');
      ['contains_asbestos', 'contains_rpw', 'contains_wass', 'signs_of_contamination', 'demolition_on_site'].forEach(function (k) { if (qs.get(k) === 'Yes' || qs.get(k) === 'No') pre[k] = qs.get(k); });
      var saved = store(DRAFT);
      apply(saved && saved.d ? saved.d : {});
      apply(pre);
      prefilled = true;
      $('#prefill-note').classList.add('show');
    } else {
      var draft = store(DRAFT);
      if (draft && draft.d) {
        apply(draft.d);
        var n = $('#draft-note');
        if (n) {
          n.classList.add('show');
          $('[data-clear-draft]', n).addEventListener('click', function () { store(DRAFT, null); decl.reset(); n.classList.remove('show'); refreshBlocked(); setDate(); });
        }
      }
    }
    function setDate() { var sd = $('input[name="signature_date"]', decl); if (sd && !sd.value) sd.value = new Date().toISOString().slice(0, 10); }
    setDate();
    go(0);

    decl.addEventListener('submit', function (e) {
      e.preventDefault();
      // Re-validate every step before sending
      for (var i = 0; i < sections.length; i++) {
        if (sections[i].hasAttribute('data-review')) continue;
        if (!validateStep(i)) { go(i); validateStep(i); return; }
      }
      var materials = $$('input[name="material_type"]:checked', decl);
      btnSubmit.disabled = true;
      setStatus(statusEl, 'Submitting declaration…');
      var fd = new FormData(decl);
      fd.delete('material_type');
      fd.append('material_type', materials.map(function (m) { return m.value; }).join(', '));
      fd.set('sig_image', canvas.toDataURL('image/png'));
      postForm(decl.action, fd)
        .then(function (data) {
          var ref = $('#declaration-ref');
          if (ref && data.reference) ref.textContent = 'Reference: ' + data.reference;
          decl.classList.add('submitted');
          store(DRAFT, null);
          decl.hidden = true;
          $('.wizard-head').hidden = true;
          var ok = $('#declaration-success');
          ok.classList.add('show');
          ok.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
        })
        .catch(function () {
          btnSubmit.disabled = false;
          setStatus(statusEl, 'Something went wrong submitting the declaration. Please try again, or contact us.', 'err');
        });
    });

    var printBtn = $('#print-copy');
    if (printBtn) printBtn.addEventListener('click', function () {
      decl.hidden = false; decl.classList.add('static');
      window.print();
      setTimeout(function () { decl.hidden = true; decl.classList.remove('static'); }, 500);
    });
  }

  /* ---------- Printable driver card ---------- */
  var driverBtn = $('[data-print-driver]');
  if (driverBtn) driverBtn.addEventListener('click', function () {
    doc.body.classList.add('print-driver');
    window.print();
    setTimeout(function () { doc.body.classList.remove('print-driver'); }, 500);
  });
})();
