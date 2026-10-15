"""Read Ruby Marshal data without executing Ruby; audit asset references."""
from inspect_game import MarshalReader

class DataReader(MarshalReader):
    def read(self):
        kind = self.data[self.pos:self.pos+1]
        if kind in (b'o', b'S'):
            self.pos += 1
            value = {'__class__':self.read()}
            self.objects.append(value)
            for _ in range(self.integer()):
                key = self.read(); value[key] = self.read()
            return value
        if kind in (b'u', b'U'):
            self.pos += 1
            value = {'__class__':self.read()}
            self.objects.append(value)
            value['__binary__'] = self.take(self.integer()) if kind == b'u' else self.read()
            return value
        if kind in (b'{', b'}'):
            self.pos += 1
            value = {}; self.objects.append(value)
            for _ in range(self.integer()):
                key = self.read(); value[key] = self.read()
            if kind == b'}': value['__default__'] = self.read()
            return value
        if kind == b'f':
            self.pos += 1
            value = float(self.take(self.integer()).split(b'\0')[0]); self.objects.append(value); return value
        if kind == b'l':
            self.pos += 1
            sign = self.take(1)
            value = int.from_bytes(self.take(self.integer()*2),'little')
            if sign == b'-': value = -value
            self.objects.append(value); return value
        return super().read()

def walk(value, seen=None):
    if seen is None: seen = set()
    if isinstance(value, (dict,list)):
        if id(value) in seen: return
        seen.add(id(value))
    yield value
    if isinstance(value, dict):
        for key, child in value.items():
            if key not in ('__class__','__binary__'):
                yield from walk(child,seen)
    elif isinstance(value,list):
        for child in value: yield from walk(child,seen)

def decode(data):
    for encoding in ('utf-8','cp932'):
        try: return data.decode(encoding)
        except UnicodeDecodeError: pass
    return ''
