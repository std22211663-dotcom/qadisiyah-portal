// Windows launcher for the portal: starts runtime\node.exe app\server.js hidden, opens the browser, and shows a small control window.
// Built with the C# compiler that ships with Windows (see build-exe.bat); no SDK or downloads needed.
using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Threading;
using System.Windows.Forms;

static class Launcher
{
    static Process node;

    static bool PortOpen(int port)
    {
        try { using (var c = new TcpClient()) { var r = c.BeginConnect("127.0.0.1", port, null, null); return r.AsyncWaitHandle.WaitOne(400) && c.Connected; } }
        catch { return false; }
    }

    // app-style window (no tabs/address bar) with Edge or Chrome when present; plain default browser otherwise
    static void OpenApp(string url)
    {
        foreach (var p in new[] { "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe" })
            if (File.Exists(p)) { try { Process.Start(new ProcessStartInfo(p, "--app=" + url) { UseShellExecute = false }); return; } catch { } }
        Open(url);
    }

    static void Open(string url) { try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); } catch { } }

    static void Stop()
    {
        try { if (node != null && !node.HasExited) { Process.Start(new ProcessStartInfo("taskkill", "/PID " + node.Id + " /T /F") { CreateNoWindow = true, UseShellExecute = false }).WaitForExit(3000); } } catch { }
    }

    [STAThread]
    static void Main()
    {
        string dir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');
        string nodeExe = Path.Combine(dir, "runtime", "node.exe"), server = Path.Combine(dir, "app", "server.js"), data = Path.Combine(dir, "data");
        int port = 3001;
        try { int p; if (int.TryParse(File.ReadAllText(Path.Combine(dir, "port.txt")).Trim(), out p) && p > 0 && p < 65536) port = p; } catch { }
        string local = "http://localhost:" + port;

        Application.EnableVisualStyles();
        if (!File.Exists(nodeExe) || !File.Exists(server)) { MessageBox.Show("ملفات البرنامج ناقصة (runtime أو app). أعد فك الضغط كاملاً.", "بوابة تربية القادسية", MessageBoxButtons.OK, MessageBoxIcon.Error, MessageBoxDefaultButton.Button1, MessageBoxOptions.RtlReading | MessageBoxOptions.RightAlign); return; }
        if (PortOpen(port)) { OpenApp(local); return; }   // already running: just open it

        var psi = new ProcessStartInfo(nodeExe, "\"" + server + "\"") { WorkingDirectory = dir, CreateNoWindow = true, UseShellExecute = false };
        psi.EnvironmentVariables["PORT"] = port.ToString();
        psi.EnvironmentVariables["DATA_DIR"] = data;
        try { node = Process.Start(psi); } catch (Exception e) { MessageBox.Show("تعذّر تشغيل الخادم: " + e.Message, "بوابة تربية القادسية"); return; }

        string lan = "";
        try { foreach (var ni in NetworkInterface.GetAllNetworkInterfaces()) { if (ni.OperationalStatus != OperationalStatus.Up || ni.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue; foreach (var a in ni.GetIPProperties().UnicastAddresses) if (a.Address.AddressFamily == AddressFamily.InterNetwork && !a.Address.ToString().StartsWith("169.254")) lan += "http://" + a.Address + ":" + port + "\r\n"; } } catch { }

        var f = new Form { Text = "بوابة تربية القادسية الإلكترونية", Width = 460, Height = 300, StartPosition = FormStartPosition.CenterScreen, RightToLeft = RightToLeft.Yes, RightToLeftLayout = true, FormBorderStyle = FormBorderStyle.FixedSingle, MaximizeBox = false, Font = new Font("Segoe UI", 10f) };
        try { f.Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }
        var status = new Label { Left = 16, Top = 14, Width = 420, Height = 26, Text = "جارٍ تشغيل الخادم...", Font = new Font("Segoe UI", 11f, FontStyle.Bold) };
        var info = new Label { Left = 16, Top = 48, Width = 420, Height = 130, Text = "على هذا الجهاز:\r\n" + local + "\r\n\r\nمن أجهزة الشبكة نفسها:\r\n" + (lan == "" ? "(لا توجد شبكة)" : lan), RightToLeft = RightToLeft.No, TextAlign = ContentAlignment.TopLeft };
        var open = new Button { Left = 16, Top = 200, Width = 200, Height = 38, Text = "فتح البوابة في المتصفح" };
        var stop = new Button { Left = 232, Top = 200, Width = 200, Height = 38, Text = "إيقاف وإغلاق" };
        open.Click += (s, e) => OpenApp(local);
        stop.Click += (s, e) => f.Close();
        f.FormClosing += (s, e) => Stop();
        f.Controls.AddRange(new Control[] { status, info, open, stop });

        var t = new System.Windows.Forms.Timer { Interval = 500 }; int tries = 0; bool opened = false;
        t.Tick += (s, e) =>
        {
            if (node.HasExited) { t.Stop(); status.Text = "توقف الخادم. تحقق أن المنفذ " + port + " غير مستعمل."; return; }
            if (!opened && PortOpen(port)) { opened = true; status.Text = "الخادم يعمل ✔"; OpenApp(local); }
            else if (!opened && ++tries > 40) { t.Stop(); status.Text = "الخادم لم يستجب بعد..."; }
        };
        t.Start();
        Application.Run(f);
        Stop();
    }
}
