#!/bin/bash

DATA="/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json"
TYPE="library"
TYPE2="tunein"
LENGTH=$(cat $DATA | jq '. | length')
element=0
while [ ${element} -lt ${LENGTH} ]
do
        eleType=$(cat ${DATA} | jq '.['${element}'].type')
        eleType=$(echo ${eleType} | sed 's/\"//g')
        eleCover=$(cat ${DATA} | jq '.['${element}'].cover')
        eleTitle=$(cat ${DATA} | jq '.['${element}'].title')
        eleTitle=$(echo ${eleTitle} | sed 's/\"//g' | sed 's/ /%20/g')
        if [[ "${eleType}" == "${TYPE}" ]] | [[ "${eleType}" == "${TYPE2}" ]];
        then
                if [[ ${eleCover} == null ]];
                then
                        newCover="http://127.0.0.1/cover/"${eleTitle}"/cover.jpg"
                        /usr/bin/cat <<< $(/usr/bin/jq --arg v "${newCover}" '.['${element}'].cover = $v' ${DATA}) > ${DATA}

                fi
        fi
        let element+=1
done
