-- Gestos del dashboard: deslizar hacia abajo desde el borde superior centrado lo para;
-- deslizar a izquierda o derecha pasa a la pantalla siguiente o a la anterior;
-- tocar una tarjeta abre su detalle, y la X o deslizar hacia arriba desde abajo lo cierra.
-- Se ejecuta con el LuaJIT de KOReader: luajit gesture.lua [dispositivo] [debug]
local ffi = require("ffi")
local bit = require("bit")

ffi.cdef[[
struct kd_timeval { long tv_sec; long tv_usec; };
struct kd_input_event { struct kd_timeval time; unsigned short type; unsigned short code; int value; };
struct kd_absinfo { int value, minimum, maximum, fuzz, flat, resolution; };
int open(const char *path, int flags);
int read(int fd, void *buf, size_t n);
int ioctl(int fd, unsigned long req, ...);
]]
local C = ffi.C

local DEVICE = arg[1] or "/dev/input/event1"
local DEBUG = arg[2] == "debug"
if DEBUG then io.stdout:setvbuf("line") end
local STOP = "/mnt/us/extensions/kindle-dash/bin/stop.sh"
local PAGE_SH = "/mnt/us/extensions/kindle-dash/bin/page.sh"
local PAGE_FILE = "/tmp/kindle-dash.page"
local VIEW_FILE = "/tmp/kindle-dash.view"
local SCREEN_W, SCREEN_H = 1072, 1448 -- píxeles de la imagen del servidor

local EV_SYN, EV_KEY, EV_ABS = 0, 1, 3
local BTN_TOUCH = 330
local ABS_MT_POSITION_X, ABS_MT_POSITION_Y, ABS_MT_TRACKING_ID = 53, 54, 57

-- Zona y recorrido del gesto, en fracciones de pantalla.
local START_MAX_Y = 0.12              -- empieza en el 12 % superior
local START_MIN_X, START_MAX_X = 0.30, 0.70 -- en el tercio central
local MIN_DY = 0.20                   -- baja al menos un 20 % de la pantalla
local MAX_DX = 0.20                   -- sin desviarse mucho en horizontal
local SWIPE_MIN_DX = 0.25             -- cambio de pantalla: al menos un 25 % en horizontal
local SWIPE_MAX_DY = 0.15             -- y casi sin movimiento vertical
local TAP_MAX = 0.03                  -- un toque apenas se mueve
local HOME_MIN_Y = 0.85               -- volver del detalle: empieza en el 15 % inferior
local HOME_MIN_DY = 0.15              -- y sube al menos un 15 %

-- El número de pantalla vive aquí: cada gesto lo guarda y page.sh repinta con el último.
local function read_page()
  local f = io.open(PAGE_FILE)
  local n = f and tonumber(f:read("*l")) or 0
  if f then f:close() end
  return n
end

local function in_detail()
  local f = io.open(VIEW_FILE)
  if not f then return false end
  local v = f:read("*l")
  f:close()
  return v ~= nil and v ~= ""
end

local function page_sh(args)
  os.execute("sh " .. PAGE_SH .. " " .. args .. " >/dev/null 2>&1 &")
end

local function turn(step)
  local n = read_page() + step
  local f = io.open(PAGE_FILE, "w")
  if f then f:write(n, "\n"); f:close() end
  if DEBUG then print("pantalla " .. n) end
  page_sh("")
end

local fd = C.open(DEVICE, 0)
if fd < 0 then error("no se puede abrir " .. DEVICE) end

local function range(code)
  local info = ffi.new("struct kd_absinfo")
  -- EVIOCGABS(code) = _IOR('E', 0x40 + code, struct input_absinfo)
  local req = 0x80000000 + bit.lshift(ffi.sizeof(info), 16) + bit.lshift(0x45, 8) + 0x40 + code
  if C.ioctl(fd, ffi.cast("unsigned long", req), info) < 0 then error("EVIOCGABS falló") end
  return info.minimum, info.maximum
end

local minX, maxX = range(ABS_MT_POSITION_X)
local minY, maxY = range(ABS_MT_POSITION_Y)
if DEBUG then print(("rango x %d..%d  y %d..%d"):format(minX, maxX, minY, maxY)) end

local touching, x, y, sx, sy = false, nil, nil, nil, nil
local ev = ffi.new("struct kd_input_event")
local size = ffi.sizeof(ev)

local function finish()
  if sx and x then
    local nsx, nsy = (sx - minX) / (maxX - minX), (sy - minY) / (maxY - minY)
    local nx, ny = (x - minX) / (maxX - minX), (y - minY) / (maxY - minY)
    if DEBUG then print(("toque %.2f,%.2f -> %.2f,%.2f"):format(nsx, nsy, nx, ny)) end
    if nsy <= START_MAX_Y and nsx >= START_MIN_X and nsx <= START_MAX_X
        and ny - nsy >= MIN_DY and math.abs(nx - nsx) <= MAX_DX then
      os.execute("sh " .. STOP .. " >/dev/null 2>&1 &")
      os.exit(0)
    end
    local dx, dy = nx - nsx, ny - nsy
    local detail = in_detail()
    if math.abs(dx) <= TAP_MAX and math.abs(dy) <= TAP_MAX then
      -- El servidor sabe qué hay en cada punto: se le pasa en píxeles de su imagen.
      page_sh(("tap %d %d"):format(math.floor(nx * SCREEN_W), math.floor(ny * SCREEN_H)))
    elseif detail and nsy >= HOME_MIN_Y and -dy >= HOME_MIN_DY and math.abs(dx) <= MAX_DX then
      page_sh("home")
    elseif not detail and math.abs(dx) >= SWIPE_MIN_DX and math.abs(dy) <= SWIPE_MAX_DY then
      turn(dx < 0 and 1 or -1) -- hacia la izquierda, siguiente; como en iOS
    end
  end
  touching, sx, sy, x, y = false, nil, nil, nil, nil
end

while C.read(fd, ev, size) == size do
  if ev.type == EV_KEY and ev.code == BTN_TOUCH then
    if ev.value == 1 then touching = true else finish() end
  elseif ev.type == EV_ABS then
    if ev.code == ABS_MT_POSITION_X then x = ev.value
    elseif ev.code == ABS_MT_POSITION_Y then y = ev.value
    elseif ev.code == ABS_MT_TRACKING_ID and ev.value == -1 and touching then finish() end
  elseif ev.type == EV_SYN and touching and not sx and x and y then
    sx, sy = x, y -- primera posición completa del toque
  end
end
