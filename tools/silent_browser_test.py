#!/usr/bin/env python3
"""Selenium smoke test in actual Chrome with WebGL disabled."""
import json
import time
from pathlib import Path
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options

options=Options()
for flag in ("--headless=new","--disable-gpu","--disable-webgl","--disable-software-rasterizer","--no-sandbox","--disable-dev-shm-usage","--window-size=1000,860"):
    options.add_argument(flag)
options.set_capability("goog:loggingPrefs",{"browser":"ALL"})
print("Starting Chrome for silent smoke test",flush=True)
driver=webdriver.Chrome(options=options)
try:
    driver.set_page_load_timeout(35)
    driver.get("http://127.0.0.1:8766/silent/")
    for i in range(50):
        s=driver.find_element(By.ID,"status").text
        if "Canvas 2D" in s or "起動に失敗" in s:break
        time.sleep(.2)
    print("INITIAL STATUS",s,flush=True)
    assert "Canvas 2D" in s,s
    assert driver.execute_script("return !!document.querySelector('canvas').getContext('2d')") is True
    assert driver.execute_script("return document.createElement('canvas').getContext('webgl')") is None
    before=driver.execute_script("return document.getElementById('game').toDataURL().length")
    driver.find_element(By.ID,"game").click()
    time.sleep(2)
    status=driver.find_element(By.ID,"status").text
    print("AFTER START",status,flush=True)
    assert "起動に失敗" not in status
    st=driver.execute_script("return localStorage.getItem('tanoshi-silent-2d-v1:auto')")
    assert st,"new game should autosave"
    data=json.loads(st)["state"]
    print("STATE MAP",data["mapId"],"X",data["x"],"Y",data["y"],flush=True)
    assert data["mapId"] in [2,3],"startup map should auto transfer"
    after=driver.execute_script("return document.getElementById('game').toDataURL().length")
    print("Canvas PNG lengths",before,after)
    driver.save_screenshot("/tmp/silent-smoke.png")
    requests=driver.execute_script("return performance.getEntriesByType('resource').map(x=>x.name)")
    not_silent=[a for a in requests if a.lower().endswith((".ogg",".wav",".mp3",".wasm")) or ".mkxpz" in a.lower()]
    assert not not_silent,not_silent
    print("Network resources",len(requests),"disallowed",not_silent)
    errors=[r for r in driver.get_log("browser") if r.get("level")=="SEVERE"]
    assert not errors,errors
    assert after>5000,"canvas looks empty"
    print("SMOKE PASS",flush=True)
finally:
    driver.quit()
