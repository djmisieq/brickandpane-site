document.addEventListener('DOMContentLoaded',()=>{const b=document.querySelector('.menu-btn'),n=document.querySelector('nav');b&&b.addEventListener('click',()=>{n.classList.toggle('open');b.setAttribute('aria-expanded',n.classList.contains('open'))});
const f=document.querySelector('#contact-form');f&&f.addEventListener('submit',e=>{e.preventDefault();document.querySelector('#form-msg').style.display='block';f.reset();});
const y=document.querySelector('#yr');y&&(y.textContent=new Date().getFullYear());});
