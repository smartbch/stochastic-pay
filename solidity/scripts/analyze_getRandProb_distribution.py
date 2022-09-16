import random

#python rand.py  |sort -k 1 -n |cat -n  |gawk '$1==2500||$1==5000||$1==7500||$1==9000||$1==9500||$1==1000'

for i in range(10000):
    a = 0
    for j in range(8):
        if random.randint(0, 100) < 31:
            a += random.randint(0, 255)
    print("%d %f"%(a, a/(4*256.0)))
