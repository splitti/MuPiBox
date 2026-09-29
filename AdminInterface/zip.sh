#!/bin/bash
cd "$(dirname "$0")"
cd www && zip -r ../release/www.zip .
