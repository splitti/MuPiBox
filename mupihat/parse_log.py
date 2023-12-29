#!/usr/bin/python3
import re
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from datetime import datetime

#logfile name
logfile = './mupihat/log_discharge2.txt'

#open file
file1 = open(logfile, 'r')
count = 0
# [time][Vbat][Ibat]
#log_data = np.array([[],[],[]])

timestamp = []
vbat = []
ibat = []

while True:
    # Get next line from file
    line = file1.readline()
    #Timestamp?
    x = re.search("2023.*$", line)
    if x:
        # add timestamp to list
        # tbd
        count += 1
        timestamp.append(x.group())
             
    else:
        #VBAT?
        x = re.search("(     Battery Voltage  \[mV\]     =)(.+)", line)
        if x:
            # add VBAT to list
            # tbd
            vbat.append(x.group(2))
        else:
            #IBAT?
            x = re.search("(     IBAT \(Dis-\)Charge \[mA\]    =)(.+)", line)
            if x:
                # add IBAT to list
                # tbd
                ibat.append(x.group(2))
            
    # if line is empty
    # end of file is reached
    if not line:
        break
file1.close()

print("Entries: ",count)
timestamp = pd.to_datetime(timestamp)
vbat = pd.to_numeric(vbat)
,
vbat = np.array(vbat)
kernel_size = 20
kernel = np.ones(kernel_size) / kernel_size
vbat_avg = np.convolve(vbat, kernel, mode='same')

ibat = pd.to_numeric(ibat)*-1
ibat_avg = np.convolve(ibat, kernel, mode='same')

#plot
fig, ax1 = plt.subplots()
ax2 = ax1.twinx()
ax1.set_xlabel("Time")
ax1.set_ylabel("V-Bat [mV]", color='g')
ax2.set_ylabel("I-Bat [mA]", color = 'b')
plt.title("Discharge Curve, Filename " + logfile)
plt.grid('both')
ax1.plot(timestamp,vbat_avg, 'g-')
ax2.plot(timestamp,ibat_avg, 'b-')
plt.legend()
plt.show()
