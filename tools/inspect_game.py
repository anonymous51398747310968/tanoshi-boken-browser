from pathlib import Path
import struct, zlib, json


def extract_rgss3(data):
    assert data[:8] == b'RGSSAD\x00\x03'
    key = (struct.unpack_from('<I', data, 8)[0] * 9 + 3) & 0xffffffff
    pos = 12
    entries = {}
    while True:
        offset, size, filekey, namesize = [n ^ key for n in struct.unpack_from('<4I', data, pos)]
        pos += 16
        if not offset:
            break
        kb = struct.pack('<I', key)
        name = bytes(v ^ kb[i % 4] for i, v in enumerate(data[pos:pos+namesize])).decode('utf-8')
        pos += namesize
        result = bytearray(data[offset:offset+size])
        for i in range(0, size, 4):
            word = struct.pack('<I', filekey)
            for j in range(min(4, size-i)):
                result[i+j] ^= word[j]
            filekey = (filekey * 7 + 3) & 0xffffffff
        entries[name.replace('\\','/')] = bytes(result)
    return entries

class MarshalReader:
    def __init__(self, data):
        assert data[:2] == b'\x04\x08'
        self.data, self.pos, self.objects, self.symbols = data, 2, [], []
    def take(self, n):
        out = self.data[self.pos:self.pos+n]; self.pos += n; return out
    def integer(self):
        n = int.from_bytes(self.take(1), 'little', signed=True)
        if n == 0: return 0
        if n > 4: return n - 5
        if n < -4: return n + 5
        if n > 0: return int.from_bytes(self.take(n), 'little')
        return int.from_bytes(self.take(-n), 'little') - (1 << (-n*8))
    def read(self):
        kind = self.take(1)
        if kind == b'i': return self.integer()
        if kind == b'0': return None
        if kind == b'T': return True
        if kind == b'F': return False
        if kind == b'@': return self.objects[self.integer()]
        if kind == b';': return self.symbols[self.integer()]
        if kind == b':':
            value = self.take(self.integer()); self.symbols.append(value); return value
        if kind == b'"':
            value = self.take(self.integer()); self.objects.append(value); return value
        if kind == b'[':
            count = self.integer(); value = []; self.objects.append(value)
            value.extend(self.read() for _ in range(count)); return value
        if kind == b'I':
            value = self.read()
            for _ in range(self.integer()): self.read(); self.read()
            return value
        raise ValueError((kind, self.pos))

