/**
 * Copyright (C) 2021 THL A29 Limited, a Tencent company.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import SyntaxBase from '@/core/SyntaxBase';
import { isLookbehindSupported } from '@/utils/regexp';
import { replaceLookbehind } from '@/utils/lookbehind-replace';

export default class BackgroundColor extends SyntaxBase {
  static HOOK_NAME = 'bgColor';
  // constructor() {
  //     super();
  // }

  toHtml(whole, m1, m2) {
    return `<span style="background-color:${m1}">${m2}</span>`;
  }

  makeHtml(str) {
    if (isLookbehindSupported()) {
      return str.replace(this.RULE.reg, this.toHtml);
    }
    return replaceLookbehind(str, this.RULE.reg, this.toHtml, true, 1);
  }

  rule() {
    const ret = {
      begin: isLookbehindSupported() ? '(?<!\\\\)\\!\\!\\!' : '(?:^|[^\\\\])\\!\\!\\!',
      end: '\\!\\!\\!',
      content: '(#[0-9a-zA-Z]{3,6}|[a-z]{3,10})[\\s]([\\w\\W]+?)',
    };
    ret.reg = new RegExp(ret.begin + ret.content + ret.end, 'g');
    return ret;
  }
}
