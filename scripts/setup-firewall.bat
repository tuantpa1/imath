@echo off
echo ========================================
echo  iMath - Mo cong tuong lua Windows
echo ========================================
echo.
echo Ban can chay file nay voi quyen Administrator.
echo.

netsh advfirewall firewall delete rule name="iMath Frontend" >nul 2>&1
netsh advfirewall firewall delete rule name="iMath Backend"  >nul 2>&1

netsh advfirewall firewall add rule name="iMath Frontend" dir=in action=allow protocol=TCP localport=3000
netsh advfirewall firewall add rule name="iMath Backend"  dir=in action=allow protocol=TCP localport=3001

echo.
echo ========================================
echo  Da mo cong 3000 (frontend) va 3001 (backend)!
echo  Bay gio cac thiet bi khac co the truy cap.
echo ========================================
echo.
pause
