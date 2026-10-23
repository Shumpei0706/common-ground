// Draft for operator/legal review; wording by AGY.
export const policies = {
  "en": {
    "credits": [
      {
        "body": [
          "DRAFT FOR OPERATOR AND LEGAL REVIEW — This document is a draft prepared for operator and legal review prior to public release."
        ],
        "heading": "Draft Status Notice"
      },
      {
        "body": [
          "Common Ground's original software is offered under the MIT License, Copyright (c) 2026 STUDIO-GENNAI. The repository LICENSE file governs.",
          "The MIT License applies only to Common Ground's original software and does not grant any rights in Qloo responses or data, or in third-party media or content. Those materials remain subject to their respective terms and licenses, and mandatory statutory rights are unaffected."
        ],
        "heading": "Software License Status"
      },
      {
        "body": [
          "Optional promotional video material uses \"Wallpaper\" by Kevin MacLeod (https://www.incompetech.com/music/royalty-free/index.html?isrc=USUAN1100843), licensed under Creative Commons Attribution 4.0 International (CC BY 4.0, https://creativecommons.org/licenses/by/4.0/). For the optional video, the track was trimmed, faded, and volume-adjusted. The current interactive card application does not automatically play background music or audio."
        ],
        "heading": "Optional Promotional Video Music"
      },
      {
        "body": [
          "Optional video and legacy materials include UI sound effects from Kenney \"UI Audio\" (https://kenney.nl/assets/ui-audio) under CC0 1.0 Universal (https://creativecommons.org/publicdomain/zero/1.0/), specifically click1.ogg and switch6.ogg with timing and volume adjustments. The current card web application does not automatically play these sound effects.",
          "Legacy Japanese promotional video narration uses VOICEVOX (credit: VOICEVOX:四国めたん). This credit applies only to the Japanese legacy video narration and does not apply to English narration or the interactive card application."
        ],
        "heading": "Audio & Video Credits"
      },
      {
        "body": [
          "Cultural affinity tags and work lookup data are provided via the optional Qloo API. Qloo outputs and trademarks remain subject to Qloo's own terms (https://www.qloo.com/legal/terms)."
        ],
        "heading": "Third-Party Services"
      }
    ],
    "privacy": [
      {
        "body": [
          "DRAFT FOR OPERATOR AND LEGAL REVIEW — This Privacy Notice is a draft for operator and legal review. Before public release, the operator must complete all bracketed metadata fields ({operatorName}, {contact}, {hostingProvider}, {hostingRegion}, {logRetentionDays}, {backupRetentionDays}, and {hostingRetention}).",
          "Operator: {operatorName}. Contact for privacy, deletion, or security inquiries: {contact}."
        ],
        "heading": "Draft Notice & Operator Contact"
      },
      {
        "body": [
          "Participants do not create accounts. You participate using a nickname visible to the host and admitted room members after you join. Do not submit real names, contact information, sensitive personal data, or confidential secrets in any field, including work search text.",
          "Your initial work selection and personal descriptive words stay private until you choose to publish them to the room board. Published final boards are visible only to the host and admitted room participants, not published to the general internet. Anyone who forwards an active full invitation link or key grants room access to the recipient.",
          "The host can stop new joins (which blocks new admissions while existing joined participants keep access), replace the room invitation (which revokes the previous invitation key and any unjoined non-participant viewer admissions while already joined participants keep access), or remove a specific participant (which permanently deletes their participant record on the server and rotates the room invitation to revoke previous-key re-entry and unjoined viewer admissions while remaining already joined participants keep access). Participant self-deletion likewise rotates the room invitation; neither prevents a remaining participant from sharing a new invitation."
        ],
        "heading": "Room Participation, Visibility & Host Controls"
      },
      {
        "body": [
          "Public deployments use an essential random HttpOnly SameSite cookie that expires after at most 2 hours to maintain room access. Your browser stores your language preference in localStorage until you or your browser clear it. Per-tab editing drafts in sessionStorage have a 2-hour logical bound checked by housekeeping within 60 seconds while the app is open; in closed or inactive tabs, the browser may retain draft storage until the app resumes or the tab closes.",
          "For essential abuse and rate-limit protection (not analytics), the server processes the request source IP using a server-secret HMAC that logically expires after 1 hour and is cleaned up within 60 seconds while the service is running. This keyed hash is pseudonymous, not anonymous. The application does not write raw IP addresses to application logs and does not use analytics, advertising trackers, or device fingerprinting."
        ],
        "heading": "Cookies, Local Storage & Rate-Limit Protection"
      },
      {
        "body": [
          "Active room and participant content on the server logically expires after 2 hours, and an automated sweeper clears expired room content within 60 seconds after expiration while the service is running. Source IP HMAC rate-limit entries logically expire after 1 hour and are cleaned up within 60 seconds while the service is running.",
          "After the 2-hour content expiry, minimal spent request counts and no-retry request hashes remain on the server for cost and abuse control, without full submitted content stored in that ledger.",
          "Underlying hosting infrastructure may independently log raw IP addresses and retain backups according to the hosting configuration: provider {hostingProvider}, region {hostingRegion}, log retention {logRetentionDays} days, backup retention {backupRetentionDays} days, and retention summary {hostingRetention}."
        ],
        "heading": "Data Retention, Operational Metadata & Infrastructure Logs"
      },
      {
        "body": [
          "A participant can delete their own server data, and the host can remove an individual participant or delete the entire room at any time. Both participant self-deletion and host removal of a participant permanently delete that participant's server data, clear cached Qloo lookup data for that room, and rotate the room invitation to revoke previous-key re-entry and unjoined viewer admissions while remaining already joined participants keep access (though another participant could still share a new invitation). Deleting all room data revokes the entire room. When you trigger deletion yourself, drafts in your current browser tab are also cleared.",
          "Deletion has technical limits: minimal spent request counts and no-retry request hashes remain on the server for cost and abuse control without storing full submitted content in that ledger; the server cannot remotely erase other browser tabs or copies, and sessionStorage drafts in other tabs remain subject to the 2-hour logical bound checked within 60 seconds while the app is open (or retained by the browser in closed/inactive tabs until the app resumes or the tab closes), while localStorage language preferences persist until cleared by the user or browser; and deletion cannot recall screenshots, copies made by other participants, infrastructure logs and backups governed by {hostingRetention}, or search queries already transmitted to Qloo."
        ],
        "heading": "Deletion & Its Technical Limits"
      },
      {
        "body": [
          "If the optional Qloo feature is used, the server sends manually entered work search text or official work IDs to Qloo (server-to-server). Your nickname and your own descriptive-word fields are never sent to Qloo. Do not paste or enter personal, contact, sensitive, or confidential data into work search text; although a best-effort pattern filter blocks obvious contact details and links before forwarding, filters cannot guarantee detection of all personal data.",
          "This application cannot delete inputs already sent to Qloo or upstream data held by Qloo. Under Qloo's general terms, anonymous inputs may be retained and reused by Qloo for model and service improvement. Qloo processes data under its own policies: https://www.qloo.com/legal/privacy and https://www.qloo.com/legal/terms."
        ],
        "heading": "Optional Qloo Integration"
      }
    ],
    "terms": [
      {
        "body": [
          "DRAFT FOR OPERATOR AND LEGAL REVIEW — These Terms of Use are a draft for operator and legal review. Before public release, the operator must complete all bracketed metadata fields ({operatorName}, {contact}, {hostingProvider}, {hostingRegion}, {logRetentionDays}, {backupRetentionDays}, and {hostingRetention}).",
          "Operator: {operatorName} ({contact}). Hosting configuration: provider {hostingProvider}, region {hostingRegion}, log retention {logRetentionDays} days, backup retention {backupRetentionDays} days, and retention summary {hostingRetention}."
        ],
        "heading": "Draft Notice & Operator"
      },
      {
        "body": [
          "Common Ground is an invite-only experimental workshop application. Creating a room requires a valid host invitation from the operator. Joining a room requires the host's full invitation link, or the room code plus the participant invitation key. By creating or joining a room, you agree to these Terms and acknowledge the Privacy Notice.",
          "Participation is restricted to users aged 18 and older as an operator beta restriction. Separate third-party age or commercial terms from Qloo remain subject to operator and legal review before release."
        ],
        "heading": "Invite-Only Beta & 18+ Operating Restriction"
      },
      {
        "body": [
          "You must use a nickname and must not enter real names, contact information, links, personal or sensitive data, or confidential secrets in any field, including work search text. Harassment, abuse, and automated requests or scraping are prohibited.",
          "Admitted participants and viewers can see the room, and forwarding an active room invitation link or key grants room access to the recipient. The room host may stop new joins (blocking new admissions while preserving access for already joined participants), replace the room invitation (revoking the prior invitation key and any unjoined viewer admissions while preserving access for already joined participants), remove any participant (permanently deleting that participant's server data and rotating the room invitation to revoke previous-key re-entry and unjoined viewer admissions while remaining joined participants keep access, just as participant self-deletion does), or delete the entire room at any time."
        ],
        "heading": "Acceptable Use, Invitations & Host Controls"
      },
      {
        "body": [
          "When enabled, the optional Qloo feature sends manually entered work search text or official work IDs from the server to Qloo to return suggested prompts, without sending your nickname or own descriptive-word fields. You must not paste or enter personal, contact, sensitive, or confidential information into work search text. Qloo output tags are workshop conversation prompts only—they are not psychological diagnoses or verified explanations of why you like a work.",
          "Queries sent to Qloo cannot be recalled or deleted by this application, and anonymous inputs may be retained and reused by Qloo for model and service improvement under Qloo's Terms of Service (https://www.qloo.com/legal/terms) and Privacy Policy (https://www.qloo.com/legal/privacy)."
        ],
        "heading": "Optional Qloo Prompts"
      },
      {
        "body": [
          "This experimental beta is provided on an as-is basis and may be modified, rate-limited (including via pseudonymous server-secret HMAC processing of source IPs that logically expires after 1 hour and is cleaned up within 60 seconds while the service is running), or stopped at any time without guaranteed availability. Minimal spent request counts and no-retry request hashes remain after content logical expiry or deletion for cost and abuse control without full submitted content stored in that ledger.",
          "Common Ground's original software is provided under the MIT License (Copyright (c) 2026 STUDIO-GENNAI, governed by the LICENSE file) without additional software warranties or any licensing of external data. Nothing in these terms waives mandatory statutory rights. For support, deletion requests, or security reports, contact {contact}."
        ],
        "heading": "Experimental Service, License Status & Statutory Rights"
      }
    ]
  },
  "ja": {
    "credits": [
      {
        "body": [
          "運営・法務確認用ドラフト — 本文書は一般公開前に運営者および法務が確認するためのドラフトです。"
        ],
        "heading": "ドラフトに関する注記"
      },
      {
        "body": [
          "Common Ground のオリジナルソフトウェアは MIT ライセンスのもとで提供されています（Copyright (c) 2026 STUDIO-GENNAI）。詳細な条件についてはリポジトリの LICENSE ファイルが適用されます。",
          "MIT ライセンスは Common Ground のオリジナルソフトウェアにのみ適用され、Qloo のレスポンス・データや第三者のメディア・コンテンツに対する権利を付与するものではありません。これらはそれぞれの規約およびライセンスに従うものとし、強行法規に基づく法定の権利は影響を受けません。"
        ],
        "heading": "ソフトウェアライセンスのステータス"
      },
      {
        "body": [
          "任意のプロモーション動画では、Creative Commons Attribution 4.0 International（CC BY 4.0、https://creativecommons.org/licenses/by/4.0/）の下でライセンスされたKevin MacLeodによる「Wallpaper」（https://www.incompetech.com/music/royalty-free/index.html?isrc=USUAN1100843）を使用しています。動画向けに楽曲のトリミング、フェード処理、および音量調整を行っています。現在のカードWebアプリが自動的にBGMや音声を再生することはありません。"
        ],
        "heading": "プロモーション動画の音楽（任意素材）"
      },
      {
        "body": [
          "任意の動画素材および旧素材には、CC0 1.0 Universal（https://creativecommons.org/publicdomain/zero/1.0/）の下で提供されるKenney「UI Audio」（https://kenney.nl/assets/ui-audio）の効果音（タイミングおよび音量を調整したclick1.oggおよびswitch6.ogg）が含まれています。現在のカードアプリがこれらの効果音を自動再生することはありません。",
          "日本語版の旧プロモーション動画ナレーションにはVOICEVOX（クレジット：VOICEVOX:四国めたん）を使用しています。このクレジットは日本語版の旧動画ナレーションのみに関するものであり、英語ナレーションや現在のカードアプリ本体には該当しません。"
        ],
        "heading": "音声・動画素材のクレジット"
      },
      {
        "body": [
          "関連タグおよび作品検索データは、任意のQloo APIを通じて提供されます。Qlooの出力および商標にはQloo自身の規約（https://www.qloo.com/legal/terms）が適用されます。"
        ],
        "heading": "第三者サービス"
      }
    ],
    "privacy": [
      {
        "body": [
          "運営・法務確認用ドラフト — 本プライバシー通知は運営者および法務確認用のドラフトです。一般公開前に、運営者はすべての項目（{operatorName}、{contact}、{hostingProvider}、{hostingRegion}、{logRetentionDays}、{backupRetentionDays}、{hostingRetention}）を記入する必要があります。",
          "運営者：{operatorName}。プライバシー・削除・セキュリティに関する連絡先：{contact}。"
        ],
        "heading": "ドラフト注記および運営者連絡先"
      },
      {
        "body": [
          "参加者のアカウント登録はありません。入室後、ホストおよび承認されたルーム参加者に表示されるニックネームを使用して参加します。作品検索テキストを含むいかなる欄にも、本名、連絡先、要配慮個人情報、または機密情報を入力しないでください。",
          "最初の作品選択や自分の言葉による記述は、あなたがルームのボードに公開するまで非公開に保たれます。公開された最終ボードはホストと承認されたルーム参加者のみが閲覧でき、インターネット全体には公開されません。有効な招待リンク全体や招待キーを他者に転送すると、受け取った相手にもルームへのアクセス権が付与されます。",
          "ホストは、新規参加の停止（既存の参加者のアクセス権を維持したまま新規入室を遮断）、招待の差し替え（すでに参加しているメンバーのアクセス権を維持したまま、以前の招待キーおよび未参加の閲覧承認を失効）、または特定の参加者の削除（サーバー上の該当参加者データを完全に削除し、残りの参加済みメンバーのアクセス権を維持したまま招待を差し替えて旧キーでの再入室と未参加の閲覧承認を失効）を行うことができます。参加者自身のデータ削除でも同様に招待が差し替えられますが、いずれも残りの参加者が新しい招待を共有することを防ぐものではありません。"
        ],
        "heading": "ルーム参加・公開範囲およびホスト管理機能"
      },
      {
        "body": [
          "公開環境では、ルームアクセス維持のために最大2時間で失効する必須のランダムなHttpOnly・SameSite Cookieを使用します。ブラウザのlocalStorageに保存される言語設定は、ユーザーまたはブラウザが消去するまで保持されます。タブごとのsessionStorageに保存される編集中の下書きは2時間の論理的な有効期限を持ち、アプリを開いている間は60秒以内にハウスキーピング処理で点検されますが、閉じたタブや非アクティブなタブではアプリ再開またはタブ終了までブラウザ側に残る場合があります。",
          "アクセス解析ではなく必須の不正利用防止およびレート制限のため、サーバーはリクエスト元のIPアドレスをサーバー秘密鍵によるHMACで変換し、論理的な有効期限1時間（サービス稼働中は期限切れ後60秒以内に消去）として処理します。このキー付きハッシュは仮名化であり、匿名ではありません。アプリ自体は生のIPアドレスをアプリケーションログに記録せず、アクセス解析、広告トラッカー、デバイスフィンガープリントも使用しません。"
        ],
        "heading": "Cookie・ブラウザ内ストレージおよびレート制限保護"
      },
      {
        "body": [
          "サーバー上のルームおよび参加者のコンテンツは2時間で論理的に期限切れとなり、サービス稼働中は自動スイーパーにより期限切れ後60秒以内に消去されます。送信元IPのHMACレート制限記録は1時間で論理的に期限切れとなり、サービス稼働中は60秒以内に消去されます。",
          "2時間のコンテンツ期限切れ後も、コストおよび不正利用管理のため、送信内容の全文を台帳に保存することなく、最小限の消費リクエスト数と再試行防止リクエストハッシュがサーバーに保持されます。",
          "ホスティング基盤は独立して生のIPアドレスのログ記録やバックアップ保持を行う場合があります（ホスティング事業者：{hostingProvider}、リージョン：{hostingRegion}、ログ保持日数：{logRetentionDays}日、バックアップ保持日数：{backupRetentionDays}日、保持設定概要：{hostingRetention}）。"
        ],
        "heading": "データ保持・運用メタデータおよびインフラログ"
      },
      {
        "body": [
          "参加者は自身のサーバーデータを削除でき、ホストは特定の参加者の削除またはルーム全体の削除をいつでも実行できます。参加者自身の削除およびホストによる参加者削除はいずれも該当参加者のサーバーデータとキャッシュ済みQloo検索データを消去し、ルームの招待を差し替えて旧キーでの再入室および未参加の閲覧承認を失効させます（残りの参加済みメンバーは引き続きアクセスでき、別の参加者が新しい招待を共有する可能性は残ります）。ルーム全体のデータ削除はルーム全体を失効させます。参加者自身が削除を実行した場合は、現在のブラウザタブの下書きも消去されます。",
          "削除には技術的な限界があります。コストおよび不正利用管理のため、送信内容の全文を台帳に保存することなく最小限の消費リクエスト数と再試行防止リクエストハッシュがサーバーに残ります。また、サーバーから他のブラウザタブやコピーを遠隔消去することはできず、別タブのsessionStorageの下書きはアプリ表示中に60秒以内の点検で適用される2時間の論理期限に従い（閉じたタブや非アクティブなタブではアプリ再開またはタブ終了まで残る場合があり）、localStorageの言語設定はユーザーまたはブラウザが消去するまで残ります。さらに、他の参加者がコピー・画面撮影した内容、{hostingRetention} に従うインフラのログおよびバックアップ、ならびにすでにQlooへ送信された検索データは回収・削除できません。"
        ],
        "heading": "データ削除とその技術的限界"
      },
      {
        "body": [
          "任意のQloo機能を使用する場合、サーバー間通信により手入力された作品検索テキストまたは公式作品IDのみがQlooへ送信されます。ニックネーム欄や自身の自由記述欄の言葉がQlooへ送信されることはありません。作品検索テキストに個人情報、連絡先、要配慮情報、または機密情報を貼り付けたり入力したりしないでください（送信前に明白な連絡先やリンクを除外するベストエフォートのパターンフィルタが適用されますが、フィルタですべての個人データの検出を保証することはできません）。",
          "本アプリからQlooへ送信済みの入力やQloo側の上流データを削除することはできません。Qlooの一般規約に基づき、匿名の入力データはモデルおよびサービスの改善のためにQlooによって保持・再利用される場合があります。Qlooでのデータ処理には同社の条件が適用されます：https://www.qloo.com/legal/privacy および https://www.qloo.com/legal/terms。"
        ],
        "heading": "任意のQloo連携"
      }
    ],
    "terms": [
      {
        "body": [
          "運営・法務確認用ドラフト — 本利用規約は運営者および法務確認用のドラフトです。一般公開前に、運営者はすべての項目（{operatorName}、{contact}、{hostingProvider}、{hostingRegion}、{logRetentionDays}、{backupRetentionDays}、{hostingRetention}）を記入する必要があります。",
          "運営者：{operatorName}（連絡先：{contact}）。ホスティング設定：事業者 {hostingProvider}、リージョン {hostingRegion}、ログ保持日数 {logRetentionDays}日、バックアップ保持日数 {backupRetentionDays}日、保持設定概要 {hostingRetention}。"
        ],
        "heading": "ドラフト注記および運営者"
      },
      {
        "body": [
          "Common Groundは招待制の実験的ワークショップアプリです。ルームの作成には、運営者が発行する有効なホスト招待が必要です。ルームへの参加には、ホストの招待リンク全体、またはルームコードと参加者招待キーの両方が必要です。ルームの作成または参加により、本規約に同意し、プライバシー通知を確認したものとみなされます。",
          "運営上のベータ制限として、利用は18歳以上に制限されています。これとは別に、Qlooに関する年齢条件や商用利用条件の確認はリリース前の運営・法務確認事項となります。"
        ],
        "heading": "招待制ベータおよび18歳以上制限"
      },
      {
        "body": [
          "参加時はニックネームを使用し、作品検索テキストを含むいかなる欄にも本名、連絡先、リンク、個人情報・機密情報などを入力してはなりません。嫌がらせ、不正利用、自動化ツールによるリクエストやスクレイピングを禁止します。",
          "入室を認められた人がルームを閲覧でき、有効な招待リンクや招待キーを転送すると、転送先にもルームへのアクセス権が付与されます。ホストはいつでも新規参加の停止（新規入室を遮断し、既存参加者のアクセス権は維持）、招待の差し替え（既存参加者のアクセス権を維持したまま、旧招待キーと未参加の閲覧承認を失効）、特定の参加者の削除（参加者自身の削除と同様に、該当参加者のサーバーデータを完全削除し、残りの参加済みメンバーのアクセス権を維持したまま招待を差し替えて旧キーでの再入室と未参加の閲覧承認を失効）、またはルーム全体の削除を行うことができます。"
        ],
        "heading": "禁止事項・招待管理およびホスト権限"
      },
      {
        "body": [
          "任意のQloo機能を有効にすると、ニックネーム欄や自身の自由記述欄の言葉を送信することなく、手入力された作品検索テキストまたは公式作品IDがサーバーからQlooへ送信され、対話のきっかけとなるタグが返されます。作品検索テキストには個人情報・連絡先・機密情報を貼り付けたり入力したりしてはなりません。Qlooの出力タグはワークショップ用のヒントであり、心理診断や作品を好む理由の確定的な裏付けではありません。",
          "Qlooへ送信された検索データを本アプリから取り消したり削除したりすることはできず、匿名の入力データはQlooの利用規約（https://www.qloo.com/legal/terms）およびプライバシーポリシー（https://www.qloo.com/legal/privacy）に基づき、モデルおよびサービスの改善のために保持・再利用される場合があります。"
        ],
        "heading": "任意のQlooヒント機能"
      },
      {
        "body": [
          "本サービスは実験的なベータ版として現状有姿で提供され、可用性の保証はなく、予告なく変更・レート制限（論理的な有効期限1時間・サービス稼働中は60秒以内に消去される送信元IPの仮名化されたサーバー秘密鍵HMAC処理を含む）・停止される場合があります。コンテンツの論理的な期限切れや削除後も、コストおよび不正利用管理のため、送信内容の全文を台帳に保存することなく最小限の消費リクエスト数と再試行防止リクエストハッシュが保持されます。",
          "Common Ground のオリジナルソフトウェアは MIT ライセンス（Copyright (c) 2026 STUDIO-GENNAI、LICENSE ファイル準拠）で提供されており、ソフトウェアに関する追加の保証や外部データのライセンス付与を行うものではありません。本規約は強行法規に基づく法定の権利を制限または放棄させるものではありません。サポート、削除依頼、セキュリティに関する報告は {contact} までご連絡ください。"
        ],
        "heading": "実験的サービス・ライセンス状態および法令上の権利"
      }
    ]
  }
};
