#!/usr/bin/python3
import re
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from datetime import datetime

#logfile name
log_path = 'C:/Users/stopf/OneDrive/Dokumente/GitHub/MupiHAT/test/'
#filename = 'logfile_discharge.txt'
#filename = 'log_discharge2.txt'
#filename = 'log_231229_1933.txt'
#filename = 'log_discharge_30122023_1044.txt'
#filename = 'log_charge_231230_1645.txt'
filename = 'log_231231_1527.txt'
logfile = log_path+filename
figure_file = re.search("(.*)\..+$",filename).group(1)+'.png'
print (figure_file)
figure_path = 'C:/Users/stopf/OneDrive/Dokumente/GitHub/MupiHAT/test/'

#open file
file1 = open(logfile, 'r')
count = 0

timestamp = []
vbat = []
ibat = []
charger_stat = []
poly4x = [] 
poly4y = [] 
poly3y = [] 
poly3x = []

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
            else:
                # charger status
                x = re.search("(Charger Status.* = )(.+)$", line)
                if x:
                    charger_stat.append(x.group(2))

    # if line is empty
    # end of file is reached
    if not line:
        break
file1.close()
print("Log file parsing done, number of entries: ",count)

if 1 :
    ## process data
    arr_to_remove = []
    for i in range(0, count):
        if charger_stat[i] != 'Not Charging':
            arr_to_remove.append(i)
    print (arr_to_remove)
    del timestamp[:4]
    del vbat[:4]
    del ibat[:4]

print (len(timestamp))
 
timestamp = pd.to_datetime(timestamp)
ibat = pd.to_numeric(ibat)*-1
vbat = pd.to_numeric(vbat)
test_duration = timestamp[-1]-timestamp[0]     


# calculate Capacity
Qmax = 0
Qrem = 0
for i in range(1, len(timestamp)):
    dt = timestamp[i]-timestamp[i-1]
    Qmax = Qmax + ((ibat[i-1]/1000)*(vbat[i-1]/1000)*pd.to_numeric(dt.seconds/60/60))
print ("Capacity [Wh] =" + str(Qmax))

soc = [None]*len(timestamp)
soc[0] = 100
for i in range(1, len(timestamp)):
    dt = timestamp[i]-timestamp[i-1]
    Qrem = Qrem + ((ibat[i-1]/1000)*(vbat[i-1]/1000)*pd.to_numeric(dt.seconds/60/60))
    soc[i] = ((Qmax-Qrem)/Qmax) * 100


#create a polynomial regression
polyfunc = np.polyfit(soc, vbat, 2) 
poly4 = np.poly1d(polyfunc)

#This for loop creates an x and y list from the regression such that it can be plotted later. 
#It also calculates the hex values for the battery voltages needed to create the lookup table. 
for i in range (0, 101):    
    poly4y.append(poly4(i))    
    poly4x.append(i)    
    #vbat_16 = int(round(((poly4(i)/1000)*(2**16))/6)) #Vbat formula found in datasheet    
    #bin_vals.append(hex(vbat)) 

# Vbat
vbat = np.array(vbat)
kernel_size = 40
kernel = np.ones(kernel_size) / kernel_size
vbat_avg = np.convolve(vbat, kernel, mode='same')

# Ibat
kernel_size = 80
kernel = np.ones(kernel_size) / kernel_size
ibat_avg = np.convolve(ibat, kernel, mode='same')



#####
#plot I/V curve
fig1, ax1,  = plt.subplots()
ax2 = ax1.twinx()
ax1.set_xlabel("Time")
ax1.set_ylabel("V-Bat [mV]", color='g')
ax2.set_ylabel("I-Bat [mA]", color = 'b')
plt.title("Discharge Curve, Filename " + logfile)
ax1.grid('both')
ax1.plot(timestamp,vbat, 'g-')
ax2.plot(timestamp,ibat, 'b-')
#plt.legend()
plt.savefig(figure_path+"raw_"+figure_file)
plt.show(block=False)

fig1, ax1,  = plt.subplots()
ax2 = ax1.twinx()
ax1.set_xlabel("Time")
ax1.set_ylabel("V-Bat [mV]", color='g')
ax2.set_ylabel("I-Bat [mA]", color = 'b')
plt.title("Discharge Curve, Filename " + logfile)
ax1.grid('both')
ax1.plot(timestamp,vbat_avg, 'g-')
ax2.plot(timestamp,ibat_avg, 'b-')
#plt.legend()
plt.savefig(figure_path+"smoothed_"+figure_file)
plt.show(block=False)

#print (str(soc))
#print (str(vbat_avg))
#plot SOC curve
fig = plt.figure()
ax = fig.add_subplot()
ax.text(80, 5000, 'Estimated Capacity [Wh]: {:.2f} \nDuration {}'.format(Qmax,test_duration) )
plt.plot(soc, vbat, 'r', label='Battery Data') 
plt.yticks([5400, 5800, 6200, 6600, 7000, 7400, 7800, 8200]) 
plt.plot(poly4x, poly4y,'b',label='Regression') 
plt.xlabel('SOC (%)') 
plt.ylabel('Battery Voltage (mV)') 
plt.gca().invert_xaxis() #Reverses x axis so that 100% is shown as the leftmost value plt.title('Battery Voltage vs SOC') 
plt.legend() 
#plt.grid(b=True, which='major', axis='both') 
plt.savefig(figure_path+"SOC_"+figure_file)
plt.show()

